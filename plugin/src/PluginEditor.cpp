#include "PluginEditor.h"
#include "ShyoyWebData.h"

static const char* mimeFor (const juce::String& path) {
    const auto ext = path.fromLastOccurrenceOf (".", false, false).toLowerCase();
    if (ext == "html") return "text/html; charset=utf-8";
    if (ext == "js" || ext == "mjs") return "text/javascript; charset=utf-8";
    if (ext == "css") return "text/css; charset=utf-8";
    if (ext == "png") return "image/png";
    if (ext == "jpg" || ext == "jpeg") return "image/jpeg";
    if (ext == "svg") return "image/svg+xml";
    if (ext == "json") return "application/json; charset=utf-8";
    if (ext == "webmanifest") return "application/manifest+json";
    if (ext == "woff2") return "font/woff2";
    if (ext == "ttf") return "font/ttf";
    if (ext == "txt") return "text/plain; charset=utf-8";
    return "application/octet-stream";
}

ShyoyEditor::ShyoyEditor (ShyoyProcessor& p) : AudioProcessorEditor (p), proc (p) {
    zipStream = std::make_unique<juce::MemoryInputStream> (ShyoyWebData::shyoyweb_zip, (size_t) ShyoyWebData::shyoyweb_zipSize, false);
    zip = std::make_unique<juce::ZipFile> (zipStream.get(), false);
    makeBrowser();
    // the page scales its panel to fit whatever size the window is (as in a browser)
    setResizable (true, true);
    setResizeLimits (640, 360, 3840, 2160);
    setSize (1280, 720);
    proc.uiWake = [this] { pump(); };
}

ShyoyEditor::~ShyoyEditor() { proc.uiWake = nullptr; }

void ShyoyEditor::makeBrowser() {
    using WBC = juce::WebBrowserComponent;
    const auto dataDir = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory).getChildFile ("Shyoy");
    auto opts = WBC::Options {}
        .withBackend (WBC::Options::Backend::webview2)
        .withWinWebView2Options (WBC::Options::WinWebView2 {}.withUserDataFolder (dataDir.getChildFile ("WebView2")).withStatusBarDisabled())
        .withNativeIntegrationEnabled()
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withResourceProvider ([this] (const juce::String& url) { return resource (url); })
        .withInitialisationData ("store", shyoy::json::toString (proc.storeForUi()))
        .withInitialisationData ("running", proc.isSequencerRunning())
        .withInitialisationData ("version", SHYOY_VERSION)
        .withEventListener ("shyoy", [this] (const juce::var& v) {
            const auto kind = v["kind"].toString();
            if (kind == "log") { if (juce::SystemStats::getEnvironmentVariable ("SHYOY_LOG", {}).isNotEmpty()) std::fprintf (stderr, "[shyoy page] %s\n", v["text"].toString().toRawUTF8()); return; }
            if (kind == "msg") {
                const auto m = shyoy::json::parse (v["json"].toString());   // as text, so numbers arrive exact
                if (juce::SystemStats::getEnvironmentVariable ("SHYOY_LOG", {}).isNotEmpty()) std::fprintf (stderr, "[shyoy msg] %s\n", m["type"].toString().toRawUTF8());
                proc.postFromUi (m);
            }
            else if (kind == "store") {
                const auto key = v["k"].toString();
                if (v.hasProperty ("v")) { const auto val = v["v"].toString(); proc.storeFromUi (key, &val); }
                else proc.storeFromUi (key, nullptr);
            }
        });
    web = std::make_unique<WBC> (opts);
    addAndMakeVisible (*web);
    web->goToURL (WBC::getResourceProviderRoot());
    resized();
}

void ShyoyEditor::reloadPage() {
    if (web) { removeChildComponent (web.get()); web.reset(); }
    makeBrowser();
}

void ShyoyEditor::resized() { if (web) web->setBounds (getLocalBounds()); }

// what the engine and the host's MIDI said, to the page (30 times a second)
void ShyoyEditor::pump() {
    if (! web) return;
    evs.clear();
    proc.drainUiEvents (evs);
    int lastStep = -2;
    for (auto& e : evs) {
        auto* o = new juce::DynamicObject();
        switch (e.kind) {
            case ShyoyProcessor::UiEvent::Step: lastStep = e.i; delete o; continue;
            case ShyoyProcessor::UiEvent::CC: o->setProperty ("type", "cc"); o->setProperty ("i", e.i); o->setProperty ("v", e.v); break;
            case ShyoyProcessor::UiEvent::Bend: o->setProperty ("type", "bend"); o->setProperty ("v", e.v); break;
            case ShyoyProcessor::UiEvent::Press: o->setProperty ("type", "press"); o->setProperty ("v", e.v); break;
            case ShyoyProcessor::UiEvent::Running: o->setProperty ("type", "running"); o->setProperty ("on", e.v != 0); break;
        }
        web->emitEventIfBrowserIsVisible ("engine", juce::var (o));
    }
    if (lastStep != -2) {   // only the newest step matters to the page
        auto* o = new juce::DynamicObject(); o->setProperty ("type", "step"); o->setProperty ("i", lastStep);
        web->emitEventIfBrowserIsVisible ("engine", juce::var (o));
    }
    juce::var m;
    if (proc.takeMeters (m)) web->emitEventIfBrowserIsVisible ("engine", m);
}

std::optional<juce::WebBrowserComponent::Resource> ShyoyEditor::resource (const juce::String& url) {
    auto path = url.upToFirstOccurrenceOf ("?", false, false).upToFirstOccurrenceOf ("#", false, false);
    path = juce::URL::removeEscapeChars (path).trimCharactersAtStart ("/");
    if (path.isEmpty()) path = "index.html";
    const auto* entry = zip->getEntry (path);
    if (entry == nullptr) return std::nullopt;
    std::unique_ptr<juce::InputStream> in (zip->createStreamForEntry (*entry));
    if (in == nullptr) return std::nullopt;
    juce::MemoryBlock mb; in->readIntoMemoryBlock (mb);
    if (path == "index.html") {
        // the bridge first of all (it stands in for localStorage, which the page's first script reads), and the fonts
        // from inside the plugin instead of Google Fonts, so the editor needs no network
        auto html = mb.toString();
        html = html.replaceFirstOccurrenceOf ("<head>", "<head>\n<script src=\"plugin/bridge.js\"></script>");
        const int g = html.indexOf ("https://fonts.googleapis.com/css2");
        if (g >= 0) {
            const int a = html.substring (0, g).lastIndexOf ("<link"), b = html.indexOf (g, ">");
            if (a >= 0 && b > a) html = html.substring (0, a) + "<link rel=\"stylesheet\" href=\"plugin/fonts.css\">" + html.substring (b + 1);
        }
        html = html.replace ("<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">", "");
        mb.reset(); mb.append (html.toRawUTF8(), html.getNumBytesAsUTF8());
    }
    juce::WebBrowserComponent::Resource r;
    r.mimeType = mimeFor (path);
    // text starts with a UTF-8 byte order mark: some web views (WebKitGTK) ignore the charset on a custom scheme and
    // read scripts as Latin-1, which broke namer.js's accented-letter regex; a BOM always wins
    const bool text = r.mimeType.startsWith ("text/") || r.mimeType.startsWith ("application/json");
    const bool hasBom = mb.getSize() >= 3 && std::memcmp (mb.getData(), "\xEF\xBB\xBF", 3) == 0;
    const size_t pre = text && ! hasBom ? 3 : 0;
    r.data.resize (pre + mb.getSize());
    if (pre) std::memcpy (r.data.data(), "\xEF\xBB\xBF", 3);
    std::memcpy (r.data.data() + pre, mb.getData(), mb.getSize());
    return r;
}
