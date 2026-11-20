package com.homeflix.acquisition.source;

import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Validation stricte d'un lien magnet du catalogue : `magnet:?xt=urn:btih:<infohash>[&paramètres]`, infohash en
 * hexadécimal (40) ou en base32 (32), cohérent avec l'infohash stocké. Tout autre schéma (http, file, chemin…)
 * est refusé : un client BitTorrent suivrait une URL ou un chemin local, donc atteindrait des services internes.
 */
public final class MagnetSource {

    private static final Pattern MAGNET = Pattern.compile("^magnet:\\?xt=urn:btih:([0-9a-fA-F]{40}|[A-Za-z2-7]{32})(&\\S*)?$");
    private static final Pattern INFOHASH = Pattern.compile("^[0-9a-f]{40}$");
    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    static final int MAX_LENGTH = 2000;

    private MagnetSource() {
    }

    /** Infohash (hexadécimal minuscule) contenu dans le lien magnet, ou vide si le lien est invalide. */
    public static Optional<String> infohashOf(String magnetUri) {
        if (magnetUri == null || magnetUri.length() > MAX_LENGTH) {
            return Optional.empty();
        }
        Matcher matcher = MAGNET.matcher(magnetUri);
        if (!matcher.matches()) {
            return Optional.empty();
        }
        String hash = matcher.group(1);
        return Optional.of(hash.length() == 40 ? hash.toLowerCase(Locale.ROOT) : fromBase32(hash));
    }

    public static boolean isInfohash(String value) {
        return value != null && INFOHASH.matcher(value).matches();
    }

    /** Vrai si le lien magnet est valide ET désigne exactement l'infohash stocké. */
    public static boolean isConsistent(String magnetUri, String infohash) {
        return isInfohash(infohash) && infohashOf(magnetUri).filter(infohash::equals).isPresent();
    }

    private static String fromBase32(String encoded) {
        byte[] out = new byte[20];
        int buffer = 0;
        int bits = 0;
        int index = 0;
        for (char c : encoded.toUpperCase(Locale.ROOT).toCharArray()) {
            buffer = (buffer << 5) | BASE32.indexOf(c);
            bits += 5;
            if (bits >= 8) {
                bits -= 8;
                out[index++] = (byte) ((buffer >> bits) & 0xFF);
            }
        }
        return HexFormat.of().formatHex(out);
    }
}
