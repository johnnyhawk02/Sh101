// The few V8 definitions that V8's fdlibm port (ieee754.cc, copied unchanged apart from its #includes) needs.
#pragma once
#include <cstdint>
#include <cstring>
#include <type_traits>
#define V8_INLINE inline
#define V8_WARN_UNUSED_RESULT
#define V8_BASE_EXPORT
#if defined(_MSC_VER) && ! defined(__clang__)
 #define V8_CC_MSVC 1
#else
 #define V8_CC_MSVC 0
#endif
namespace v8 { namespace base {
template <class D, class S> inline D bit_cast (const S& s) { static_assert (sizeof (D) == sizeof (S), "size"); D d; std::memcpy (&d, &s, sizeof d); return d; }
template <class T> inline T NegateWithWraparound (T a) { using U = std::make_unsigned_t<T>; return static_cast<T> (U (0) - static_cast<U> (a)); }
template <class T> inline T AddWithWraparound (T a, T b) { using U = std::make_unsigned_t<T>; return static_cast<T> (static_cast<U> (a) + static_cast<U> (b)); }
template <class T> inline T SubWithWraparound (T a, T b) { using U = std::make_unsigned_t<T>; return static_cast<T> (static_cast<U> (a) - static_cast<U> (b)); }
template <class T> inline T MulWithWraparound (T a, T b) { using U = std::make_unsigned_t<T>; return static_cast<T> (static_cast<U> (a) * static_cast<U> (b)); }
inline double Divide (double x, double y) { return x / y; }
} }
