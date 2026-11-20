package com.homeflix.acquisition.source;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.homeflix.acquisition.api.ApiException;

/**
 * Protection SSRF : refuse toute adresse du réseau interne si une source était une URL (par exemple un fichier
 * `.torrent`). Aujourd'hui seuls des liens magnet lus en base sont utilisés ; ce garde-fou est la barrière à
 * franchir avant toute résolution ou connexion à une URL.
 *
 * <p>Bloqué : 0.0.0.0/8, 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 (dont les
 * métadonnées cloud), 100.64.0.0/10, multicast et réservé ; en IPv6 : ::, ::1, fc00::/7, fe80::/10, multicast, et
 * les adresses IPv4 encapsulées (::ffff:a.b.c.d, vues comme IPv4). Toutes les adresses d'un nom doivent être
 * publiques. Le résultat de {@link #resolve} doit être utilisé tel quel pour se connecter (jamais une seconde
 * résolution du nom : DNS rebinding).
 */
@Component
public class NetworkAddressGuard {

    private final Function<String, List<InetAddress>> resolver;

    public NetworkAddressGuard() {
        this(host -> {
            try {
                return List.of(InetAddress.getAllByName(host));
            } catch (UnknownHostException e) {
                return List.of();
            }
        });
    }

    /** Résolveur injectable : les tests n'ont pas besoin du DNS. */
    public NetworkAddressGuard(Function<String, List<InetAddress>> resolver) {
        this.resolver = resolver;
    }

    /**
     * Valide l'URL et retourne les adresses publiques auxquelles se connecter.
     *
     * @throws ApiException 400 si le schéma, les identifiants intégrés, l'hôte ou une adresse résolue ne sont pas acceptables
     */
    public List<InetAddress> resolve(String url) {
        URI uri;
        try {
            uri = URI.create(url == null ? "" : url.trim());
        } catch (IllegalArgumentException e) {
            throw refused();
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw refused();
        }
        String host = uri.getHost();
        if (host == null || host.isBlank() || uri.getUserInfo() != null) {
            throw refused();
        }
        String bare = host.startsWith("[") && host.endsWith("]") ? host.substring(1, host.length() - 1) : host;
        if (bare.equalsIgnoreCase("localhost") || bare.toLowerCase(Locale.ROOT).endsWith(".localhost")) {
            throw refused();
        }
        List<InetAddress> addresses = resolver.apply(bare);
        if (addresses.isEmpty() || addresses.stream().anyMatch(NetworkAddressGuard::isInternal)) {
            throw refused(); // une seule adresse interne suffit à refuser le nom
        }
        return addresses;
    }

    public static boolean isInternal(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) {
            return true;
        }
        byte[] b = address.getAddress();
        if (b.length == 4) {
            int first = b[0] & 0xFF;
            int second = b[1] & 0xFF;
            return first == 0                                  // 0.0.0.0/8
                || first == 100 && (second & 0xC0) == 64       // 100.64.0.0/10 (CGNAT)
                || first == 192 && second == 0 && (b[2] & 0xFF) == 0 // 192.0.0.0/24
                || first >= 240;                               // réservé et diffusion
        }
        return (b[0] & 0xFE) == 0xFC;                          // fc00::/7 (adresses locales uniques)
    }

    private static ApiException refused() {
        // Le message ne reprend jamais l'adresse testée : pas d'oracle de cartographie du réseau interne.
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Source refusée",
            "Cette adresse n'est pas autorisée comme source de téléchargement.");
    }
}
