package com.homeflix.identity.security;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.util.Base64;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;

/** Charge (ou génère en dev) la paire RSA de signature ; n'expose publiquement que la clé publique. */
@Component
public class SigningKeyProvider {

    private static final Logger log = LoggerFactory.getLogger(SigningKeyProvider.class);

    private final RSAKey key;

    public SigningKeyProvider(JwtProperties props) {
        try {
            this.key = load(props);
        } catch (Exception e) {
            // Pas de détail de la clé dans le message.
            throw new IllegalStateException("Clé de signature JWT inutilisable", e);
        }
    }

    private static RSAKey load(JwtProperties props) throws Exception {
        String b64 = props.privateKeyBase64();
        RSAPrivateKey priv;
        RSAPublicKey pub;
        if (b64 != null && !b64.isBlank()) {
            priv = (RSAPrivateKey) KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der(b64)));
            if (!(priv instanceof RSAPrivateCrtKey crt)) {
                throw new IllegalStateException("La clé privée doit contenir les paramètres CRT");
            }
            pub = (RSAPublicKey) KeyFactory.getInstance("RSA")
                .generatePublic(new RSAPublicKeySpec(crt.getModulus(), crt.getPublicExponent()));
        } else if (props.generateIfMissing()) {
            log.warn("Clé JWT absente : génération d'une clé éphémère (dev uniquement)");
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(2048);
            KeyPair pair = gen.generateKeyPair();
            priv = (RSAPrivateKey) pair.getPrivate();
            pub = (RSAPublicKey) pair.getPublic();
        } else {
            throw new IllegalStateException(
                "JWT_PRIVATE_KEY_BASE64 est requis (clé RSA PKCS#8) hors profil dev");
        }
        String kid = new RSAKey.Builder(pub).build().computeThumbprint().toString();
        return new RSAKey.Builder(pub).privateKey(priv).keyID(kid)
            .keyUse(KeyUse.SIGNATURE).algorithm(JWSAlgorithm.RS256).build();
    }

    /** Accepte la clé en DER Base64, ou un PEM encodé en Base64 (ce que produit gen-secrets.sh). */
    private static byte[] der(String b64) {
        byte[] raw = Base64.getMimeDecoder().decode(b64.trim());
        String text = new String(raw, StandardCharsets.US_ASCII);
        if (text.contains("-----BEGIN")) {
            String body = text.replaceAll("-----(BEGIN|END) [A-Z ]+-----", "").replaceAll("\\s", "");
            return Base64.getDecoder().decode(body);
        }
        return raw;
    }

    public RSAKey signingKey() {
        return key;
    }

    public RSAPublicKey publicKey() {
        try {
            return key.toRSAPublicKey();
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Jeu JWKS public : toPublicJWK() retire tout élément privé. */
    public JWKSet publicJwkSet() {
        return new JWKSet(key.toPublicJWK());
    }
}
