// shyoy_render: plays a message script through the C++ engine and writes the output as raw float32.
//   shyoy_render script.json out.f32
// script.json: { "sr": 48000, "blocks": 1500, "events": [[block, message], ...] }. Messages are applied before the block
// they name, and every block is 128 samples, exactly as the web app's AudioWorklet runs (plugin/tools/match.mjs).
#include <juce_core/juce_core.h>
#include "../src/Messages.h"

int main (int argc, char** argv) {
    if (argc < 3) { std::fprintf (stderr, "usage: shyoy_render script.json out.f32\n"); return 2; }
    const auto script = shyoy::json::parse (juce::File (argv[1]).loadFileAsString());
    const double sr = script.getProperty ("sr", 48000.0);
    const int blocks = script.getProperty ("blocks", 1000);
    shyoy::Engine e (sr);
    auto* ev = script["events"].getArray();
    int r = 0;
    std::vector<float> L (128), all; all.reserve ((size_t) blocks * 128);
    std::vector<shyoy::Cmd> cmds;
    for (int b = 0; b < blocks; b++) {
        while (ev && r < ev->size() && (int) (*ev)[r][0] <= b) { cmds.clear(); shyoy::parse ((*ev)[r][1], cmds); for (auto& c : cmds) shyoy::apply (e, c); r++; }
        e.process (L.data(), nullptr, 128);
        all.insert (all.end(), L.begin(), L.end());
    }
    juce::File out (argv[2]); out.deleteFile();
    juce::FileOutputStream os (out); os.write (all.data(), all.size() * sizeof (float));
    return 0;
}
