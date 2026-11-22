# Shyoy plugin (VST3 on Windows, macOS and Linux, plus AU and a standalone app on macOS/Linux/Windows).
# The engine is a C++ port of site/js/dsp/engine.js; the editor is the web app itself (site/) in a web view.
#   cmake -B build -S plugin -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release
cmake_minimum_required(VERSION 3.22)
project(Shyoy VERSION 0.42.3 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Minimum macOS")
if(MSVC)
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")   # no VC++ redistributable needed
endif()

# JUCE: a local checkout (-DSHYOY_JUCE_DIR=...) or fetched at a fixed tag
set(SHYOY_JUCE_DIR "" CACHE PATH "Path to a JUCE 8.0.10 checkout with cmake/juce-linux-webview.patch applied (fetched and patched when empty)")
if(SHYOY_JUCE_DIR)
  add_subdirectory(${SHYOY_JUCE_DIR} JUCE EXCLUDE_FROM_ALL)
else()
  include(FetchContent)
  # cmake/juce-linux-webview.patch fixes two bugs in JUCE's Linux web view pipe (large resources, non-ASCII text)
  FetchContent_Declare(JUCE GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 8.0.10 GIT_SHALLOW TRUE
    PATCH_COMMAND ${CMAKE_COMMAND} -DPATCH=${CMAKE_CURRENT_SOURCE_DIR}/cmake/juce-linux-webview.patch -P ${CMAKE_CURRENT_SOURCE_DIR}/cmake/apply-patch.cmake
    UPDATE_DISCONNECTED TRUE)
  FetchContent_MakeAvailable(JUCE)
endif()

# ---- the web app, packed into one zip that the plugin serves to its web view ----
set(SITE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../site)
set(WEB_DIR ${CMAKE_CURRENT_SOURCE_DIR}/web)
file(GLOB_RECURSE SITE_FILES CONFIGURE_DEPENDS ${SITE_DIR}/*)
file(GLOB_RECURSE WEB_FILES CONFIGURE_DEPENDS ${WEB_DIR}/*)
set(WEB_ZIP ${CMAKE_CURRENT_BINARY_DIR}/shyoy-web.zip)
add_custom_command(OUTPUT ${WEB_ZIP}
  COMMAND ${CMAKE_COMMAND} -DSITE=${SITE_DIR} -DWEB=${WEB_DIR} -DSTAGE=${CMAKE_CURRENT_BINARY_DIR}/web-stage -DOUT=${WEB_ZIP}
          -P ${CMAKE_CURRENT_SOURCE_DIR}/cmake/pack-web.cmake
  DEPENDS ${SITE_FILES} ${WEB_FILES} ${CMAKE_CURRENT_SOURCE_DIR}/cmake/pack-web.cmake
  COMMENT "Packing the Shyoy web app")
add_custom_target(ShyoyWebZip DEPENDS ${WEB_ZIP})
juce_add_binary_data(ShyoyWeb HEADER_NAME ShyoyWebData.h NAMESPACE ShyoyWebData SOURCES ${WEB_ZIP})
add_dependencies(ShyoyWeb ShyoyWebZip)

set(FORMATS VST3 Standalone)
if(APPLE)
  list(APPEND FORMATS AU)
endif()

juce_add_plugin(Shyoy
  PRODUCT_NAME "Shyoy"
  COMPANY_NAME "Johnny Hawk"
  BUNDLE_ID com.johnnyhawk.shyoy
  PLUGIN_MANUFACTURER_CODE Jhwk
  PLUGIN_CODE Shyo
  FORMATS ${FORMATS}
  IS_SYNTH TRUE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  NEEDS_WEB_BROWSER TRUE
  NEEDS_WEBVIEW2 TRUE
  NEEDS_CURL FALSE
  VST3_CATEGORIES Instrument Synth
  AU_MAIN_TYPE kAudioUnitType_MusicDevice
  ICON_BIG ${SITE_DIR}/icons/icon-512.png
  COPY_PLUGIN_AFTER_BUILD FALSE)

target_sources(Shyoy PRIVATE src/PluginProcessor.cpp src/PluginEditor.cpp src/v8/ieee754.cc)
target_include_directories(Shyoy PRIVATE src)
target_compile_definitions(Shyoy PUBLIC
  JUCE_WEB_BROWSER=1
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0
  JUCE_DISPLAY_SPLASH_SCREEN=0
  JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
  SHYOY_VERSION="${PROJECT_VERSION}")
# The engine has to round exactly as JavaScript does: no fast-math and no fused multiply-adds (clang fuses a*b+c on
# Apple silicon unless told not to). V8's fdlibm port (src/v8/) is compiled as it is.
function(shyoy_exact_maths target)
  if(MSVC)
    target_compile_options(${target} PRIVATE /fp:precise)   # VS2022: no contractions under /fp:precise
  else()
    target_compile_options(${target} PRIVATE -ffp-contract=off -fno-fast-math)
  endif()
endfunction()
if(MSVC)
  set_source_files_properties(src/v8/ieee754.cc PROPERTIES COMPILE_OPTIONS "/w")
else()
  set_source_files_properties(src/v8/ieee754.cc PROPERTIES COMPILE_OPTIONS "-w")
endif()
target_link_libraries(Shyoy
  PRIVATE ShyoyWeb juce::juce_audio_utils juce::juce_gui_extra
  PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags juce::juce_recommended_warning_flags)
shyoy_exact_maths(Shyoy)

# ---- shyoy_render: the engine on its own, for the sample-match check (tools/match.mjs) ----
juce_add_console_app(shyoy_render PRODUCT_NAME shyoy_render)
target_sources(shyoy_render PRIVATE tools/render.cpp src/v8/ieee754.cc)
target_compile_definitions(shyoy_render PRIVATE JUCE_USE_CURL=0 JUCE_WEB_BROWSER=0)
target_link_libraries(shyoy_render PRIVATE juce::juce_core PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
shyoy_exact_maths(shyoy_render)

# ---- shyoy_host_test: loads the VST3 like a DAW and drives its editor (tools/host-test.cpp) ----
option(SHYOY_HOST_TEST "Build the VST3 host test" OFF)
if(SHYOY_HOST_TEST)
  juce_add_gui_app(shyoy_host_test PRODUCT_NAME shyoy_host_test)
  target_sources(shyoy_host_test PRIVATE tools/host-test.cpp)
  target_compile_definitions(shyoy_host_test PRIVATE JUCE_PLUGINHOST_VST3=1 JUCE_USE_CURL=0 JUCE_WEB_BROWSER=0 JUCE_DISPLAY_SPLASH_SCREEN=0)
  target_link_libraries(shyoy_host_test PRIVATE juce::juce_audio_processors juce::juce_gui_extra PUBLIC juce::juce_recommended_config_flags)
endif()
