// Shyoy plugin: the editor is the web app (site/), served from inside the plugin to a web view. A small bridge script
// (plugin/web/bridge.js) stands in for the AudioWorklet and localStorage, so the page runs unchanged.
#pragma once
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

class ShyoyEditor : public juce::AudioProcessorEditor {
public:
    explicit ShyoyEditor (ShyoyProcessor&);
    ~ShyoyEditor() override;
    void resized() override;
    void paint (juce::Graphics& g) override { g.fillAll (juce::Colour (0xff0b0b0b)); }
    void reloadPage();   // the host loaded another state: start the page again with it

private:
    ShyoyProcessor& proc;
    std::unique_ptr<juce::WebBrowserComponent> web;
    std::unique_ptr<juce::ZipFile> zip;
    std::unique_ptr<juce::MemoryInputStream> zipStream;
    std::vector<ShyoyProcessor::UiEvent> evs;
    void makeBrowser();
    void pump();
    std::optional<juce::WebBrowserComponent::Resource> resource (const juce::String& url);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ShyoyEditor)
};
