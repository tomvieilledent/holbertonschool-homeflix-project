package com.homeflix.acquisition.source;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.InetAddress;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.homeflix.acquisition.api.ApiException;

class NetworkAddressGuardTests {

    private static InetAddress ip(String literal) throws Exception {
        return InetAddress.getByName(literal); // littéral : aucune résolution DNS
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "127.0.0.1", "127.255.255.254", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255",
        "192.168.0.1", "192.168.255.255", "169.254.169.254", "169.254.0.1", "0.0.0.0", "0.1.2.3",
        "100.64.0.1", "100.127.255.255", "224.0.0.1", "239.255.255.255", "255.255.255.255", "240.0.0.1",
        "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.5",
        "::ffff:192.168.1.1", "::ffff:169.254.169.254" })
    void internalAddressesAreRecognised(String literal) throws Exception {
        assertThat(NetworkAddressGuard.isInternal(ip(literal))).as(literal).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = { "8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1", "192.169.0.1",
        "100.63.255.255", "100.128.0.1", "169.253.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888" })
    void publicAddressesAreAccepted(String literal) throws Exception {
        assertThat(NetworkAddressGuard.isInternal(ip(literal))).as(literal).isFalse();
    }

    private static NetworkAddressGuard guardResolving(Map<String, List<String>> dns) {
        return new NetworkAddressGuard(host -> dns.getOrDefault(host, List.of()).stream().map(l -> {
            try {
                return ip(l);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }).toList());
    }

    @Test
    void aPublicHostIsAcceptedAndItsAddressesReturnedForPinning() {
        var guard = guardResolving(Map.of("exemple.org", List.of("93.184.216.34")));
        assertThat(guard.resolve("https://exemple.org/film.torrent")).hasSize(1);
        assertThat(guard.resolve("http://exemple.org:8080/film.torrent")).hasSize(1);
    }

    @Test
    void aNameResolvingToAnInternalAddressIsRefused() {
        var guard = guardResolving(Map.of(
            "interne.exemple.org", List.of("10.0.0.7"),
            "metadata.exemple.org", List.of("169.254.169.254"),
            "mixte.exemple.org", List.of("93.184.216.34", "192.168.1.10"),
            "v6.exemple.org", List.of("::ffff:127.0.0.1")));
        for (String host : List.of("interne", "metadata", "mixte", "v6")) {
            assertThatThrownBy(() -> guard.resolve("http://" + host + ".exemple.org/x.torrent"))
                .as(host).isInstanceOf(ApiException.class);
        }
    }

    @Test
    void ipLiteralsToInternalTargetsAreRefusedWithoutAnyDnsLookup() {
        var guard = new NetworkAddressGuard(host -> {
            try {
                return List.of(InetAddress.getByName(host));
            } catch (Exception e) {
                return List.of();
            }
        });
        for (String url : List.of("http://127.0.0.1/x", "http://127.1.2.3:8080/x", "http://10.1.1.1/x",
                "http://172.16.5.5/x", "http://192.168.0.1/x", "http://169.254.169.254/latest/meta-data",
                "http://[::1]/x", "http://[fd00::1]/x", "http://[::ffff:10.0.0.1]/x", "http://0.0.0.0/x")) {
            assertThatThrownBy(() -> guard.resolve(url)).as(url).isInstanceOf(ApiException.class);
        }
    }

    @Test
    void localhostNamesSchemesAndEmbeddedCredentialsAreRefused() {
        var guard = guardResolving(Map.of("localhost", List.of("93.184.216.34"), "exemple.org", List.of("93.184.216.34")));
        for (String url : List.of("http://localhost/x", "http://LOCALHOST:9091/x", "http://app.localhost/x",
                "file:///etc/passwd", "ftp://exemple.org/x", "gopher://exemple.org/", "magnet:?xt=urn:btih:abc",
                "http://utilisateur:secret@exemple.org/x", "//exemple.org/x", "exemple.org/x", "", "   ", "http://")) {
            assertThatThrownBy(() -> guard.resolve(url)).as(url).isInstanceOf(ApiException.class);
        }
        assertThatThrownBy(() -> guard.resolve(null)).isInstanceOf(ApiException.class);
    }

    @Test
    void anUnresolvableHostIsRefused() {
        assertThatThrownBy(() -> guardResolving(Map.of()).resolve("http://inconnu.exemple.org/x"))
            .isInstanceOf(ApiException.class);
    }

    @Test
    void theErrorNeverEchoesTheTestedAddress() {
        var guard = guardResolving(Map.of());
        assertThatThrownBy(() -> guard.resolve("http://192.168.77.77/secret"))
            .hasMessageNotContaining("192.168").hasMessageNotContaining("secret");
    }
}
