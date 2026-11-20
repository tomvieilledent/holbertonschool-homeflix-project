package com.homeflix.acquisition.source;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class MagnetSourceTests {

    private static final String HASH = "08ada5a7a6183aae1e09d831df6748d566095a10";
    private static final String MAGNET = "magnet:?xt=urn:btih:" + HASH + "&dn=Sintel&tr=udp%3A%2F%2Ftracker.example%3A1337";

    @Test
    void aValidMagnetYieldsItsLowercaseInfohash() {
        assertThat(MagnetSource.infohashOf(MAGNET)).contains(HASH);
        assertThat(MagnetSource.infohashOf("magnet:?xt=urn:btih:" + HASH.toUpperCase())).contains(HASH);
    }

    @Test
    void base32InfohashIsConvertedToHex() {
        // 20 octets 0x00 → 32 × « A » en base32 ; 0xFF × 20 → « 7 » × 32.
        assertThat(MagnetSource.infohashOf("magnet:?xt=urn:btih:" + "A".repeat(32))).contains("0".repeat(40));
        assertThat(MagnetSource.infohashOf("magnet:?xt=urn:btih:" + "7".repeat(32))).contains("f".repeat(40));
    }

    @Test
    void consistencyRequiresTheSameInfohash() {
        assertThat(MagnetSource.isConsistent(MAGNET, HASH)).isTrue();
        assertThat(MagnetSource.isConsistent(MAGNET, "0".repeat(40))).isFalse();
        assertThat(MagnetSource.isConsistent(MAGNET, HASH.toUpperCase())).isFalse();
        assertThat(MagnetSource.isConsistent(MAGNET, null)).isFalse();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
        "http://exemple.org/film.torrent", "https://exemple.org/x", "file:///etc/passwd", "/etc/passwd", "../x.torrent",
        "magnet:?xt=urn:btih:abc", "magnet:?xt=urn:btih:gggggggggggggggggggggggggggggggggggggggg", "magnet:?dn=sans-hash",
        "magnet:?xt=urn:sha1:08ada5a7a6183aae1e09d831df6748d566095a10", "MAGNET:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10",
        " magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10",
        "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10 http://127.0.0.1/",
        "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10\nhttp://127.0.0.1/" })
    void anythingThatIsNotAStrictMagnetIsRefused(String value) {
        assertThat(MagnetSource.infohashOf(value)).isEmpty();
    }

    @Test
    void anOversizedMagnetIsRefused() {
        assertThat(MagnetSource.infohashOf(MAGNET + "&x=" + "a".repeat(MagnetSource.MAX_LENGTH))).isEmpty();
    }
}
