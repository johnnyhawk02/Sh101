// Exact JSON for engine messages and saved state. juce::JSON rounds some numbers on the way in (0.000009999999999999999
// came back 1e-21 off), and the engine has knife edges where that last bit decides a sample, so the plugin reads and
// writes numbers itself: correctly rounded parsing, and 17 significant digits out, so every double survives the trip.
#pragma once
#include <juce_core/juce_core.h>
#include <string>
#include <cstdio>
#include <cstdlib>
#if defined(__APPLE__)
 #include <xlocale.h>
#else
 #include <charconv>
#endif

namespace shyoy::json {

inline double toDouble (const char* b, const char* e) {
#if defined(__APPLE__)
    std::string s (b, e); return strtod_l (s.c_str(), nullptr, LC_C_LOCALE);   // gdtoa: correctly rounded
#else
    double d = 0; std::from_chars (b, e, d); return d;   // correctly rounded, any locale
#endif
}

class Parser {
public:
    explicit Parser (const std::string& s) : p (s.data()), end (s.data() + s.size()) {}
    juce::var parse() { ws(); auto v = value(); return v; }
private:
    const char* p; const char* end;
    void ws() { while (p < end && (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t')) p++; }
    bool lit (const char* w) { const auto n = std::strlen (w); if ((size_t) (end - p) >= n && std::strncmp (p, w, n) == 0) { p += n; return true; } return false; }
    juce::var value() {
        ws(); if (p >= end) return {};
        const char c = *p;
        if (c == '{') {
            p++; auto* o = new juce::DynamicObject(); juce::var res (o);
            ws(); if (p < end && *p == '}') { p++; return res; }
            while (p < end) {
                ws(); if (p >= end || *p != '"') break;
                const auto k = str(); ws(); if (p < end && *p == ':') p++;
                o->setProperty (juce::Identifier (k.isEmpty() ? juce::String ("_") : k), value());
                ws(); if (p < end && *p == ',') { p++; continue; } if (p < end && *p == '}') p++; break;
            }
            return res;
        }
        if (c == '[') {
            p++; juce::Array<juce::var> a;
            ws(); if (p < end && *p == ']') { p++; return a; }
            while (p < end) { a.add (value()); ws(); if (p < end && *p == ',') { p++; continue; } if (p < end && *p == ']') p++; break; }
            return a;
        }
        if (c == '"') return str();
        if (lit ("true")) return true;
        if (lit ("false")) return false;
        if (lit ("null")) return {};
        const char* b = p;
        while (p < end && (std::isdigit ((unsigned char) *p) || *p == '-' || *p == '+' || *p == '.' || *p == 'e' || *p == 'E')) p++;
        if (p == b) { p++; return {}; }
        return toDouble (b, p);
    }
    static void utf8 (std::string& o, uint32_t cp) {
        if (cp < 0x80) o += (char) cp;
        else if (cp < 0x800) { o += (char) (0xC0 | (cp >> 6)); o += (char) (0x80 | (cp & 0x3F)); }
        else if (cp < 0x10000) { o += (char) (0xE0 | (cp >> 12)); o += (char) (0x80 | ((cp >> 6) & 0x3F)); o += (char) (0x80 | (cp & 0x3F)); }
        else { o += (char) (0xF0 | (cp >> 18)); o += (char) (0x80 | ((cp >> 12) & 0x3F)); o += (char) (0x80 | ((cp >> 6) & 0x3F)); o += (char) (0x80 | (cp & 0x3F)); }
    }
    uint32_t hex4() { uint32_t v = 0; for (int i = 0; i < 4 && p < end; i++, p++) { const char h = *p; v = v * 16 + (uint32_t) (h >= 'a' ? h - 'a' + 10 : h >= 'A' ? h - 'A' + 10 : h - '0'); } return v; }
    juce::String str() {
        std::string o; p++;   // opening quote
        while (p < end && *p != '"') {
            if (*p != '\\') { o += *p++; continue; }
            p++; if (p >= end) break;
            const char e = *p++;
            switch (e) {
                case 'n': o += '\n'; break; case 't': o += '\t'; break; case 'r': o += '\r'; break;
                case 'b': o += '\b'; break; case 'f': o += '\f'; break;
                case 'u': {
                    uint32_t cp = hex4();
                    if (cp >= 0xD800 && cp < 0xDC00 && end - p >= 6 && p[0] == '\\' && p[1] == 'u') { p += 2; const uint32_t lo = hex4(); cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00); }
                    utf8 (o, cp); break;
                }
                default: o += e;   // \" \\ \/
            }
        }
        if (p < end) p++;   // closing quote
        return juce::String::fromUTF8 (o.data(), (int) o.size());
    }
};

inline juce::var parse (const juce::String& s) { return Parser (s.toStdString()).parse(); }
inline juce::var parse (const char* s) { return Parser (std::string (s)).parse(); }

inline void number (std::string& o, double d) {
    if (! std::isfinite (d)) { o += "null"; return; }
    if (d == std::floor (d) && std::abs (d) < 1e15) { char b[32]; std::snprintf (b, sizeof b, "%.0f", d); o += b; return; }
    char b[40]; std::snprintf (b, sizeof b, "%.17g", d);
    for (char* q = b; *q; q++) if (*q == ',') *q = '.';   // a host running in a comma-decimal locale
    o += b;
}
inline void quote (std::string& o, const juce::String& s) {
    o += '"';
    for (auto* c = s.toRawUTF8(); *c; c++) {
        const auto u = (unsigned char) *c;
        if (u == '"') o += "\\\""; else if (u == '\\') o += "\\\\"; else if (u == '\n') o += "\\n"; else if (u == '\r') o += "\\r"; else if (u == '\t') o += "\\t";
        else if (u < 0x20) { char b[8]; std::snprintf (b, sizeof b, "\\u%04x", u); o += b; }
        else o += (char) u;
    }
    o += '"';
}
inline void write (std::string& o, const juce::var& v) {
    if (v.isVoid() || v.isUndefined()) o += "null";
    else if (v.isBool()) o += (bool) v ? "true" : "false";
    else if (v.isInt() || v.isInt64() || v.isDouble()) number (o, (double) v);
    else if (v.isString()) quote (o, v.toString());
    else if (auto* a = v.getArray()) { o += '['; for (int i = 0; i < a->size(); i++) { if (i) o += ','; write (o, (*a)[i]); } o += ']'; }
    else if (auto* d = v.getDynamicObject()) {
        o += '{'; bool firstOne = true;
        for (auto& nv : d->getProperties()) { if (! firstOne) o += ','; firstOne = false; quote (o, nv.name.toString()); o += ':'; write (o, nv.value); }
        o += '}';
    }
    else o += "null";
}
inline juce::String toString (const juce::var& v) { std::string o; write (o, v); return juce::String::fromUTF8 (o.data(), (int) o.size()); }

} // namespace shyoy::json
