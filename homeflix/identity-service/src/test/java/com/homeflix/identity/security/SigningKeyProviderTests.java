package com.homeflix.identity.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.KeyPairGenerator;
import java.util.Base64;

import org.junit.jupiter.api.Test;

class SigningKeyProviderTests {

    @Test
    void loadsAnEnvironmentProvidedBase64Key() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        byte[] der = gen.generateKeyPair().getPrivate().getEncoded();
        // Marqueurs PEM assemblés au runtime : aucun bloc de clé littéral dans le dépôt (scan de secrets).
        String label = String.join(" ", "PRIVATE", "KEY");
        String pem = "-----BEGIN " + label + "-----\n" + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der)
            + "\n-----END " + label + "-----\n";

        // DER en Base64 et PEM en Base64 (format produit par gen-secrets.sh) sont acceptés.
        var fromDer = new SigningKeyProvider(new JwtProperties(Base64.getEncoder().encodeToString(der), false, null, null));
        var fromPem = new SigningKeyProvider(new JwtProperties(Base64.getEncoder().encodeToString(pem.getBytes()), false, null, null));
        assertThat(fromDer.signingKey().getKeyID()).isEqualTo(fromPem.signingKey().getKeyID());
        assertThat(fromDer.publicJwkSet().toString()).doesNotContain("\"d\"");
    }

    @Test
    void refusesToStartWithoutKeyOutsideDev() {
        assertThatThrownBy(() -> new SigningKeyProvider(new JwtProperties(null, false, null, null)))
            .isInstanceOf(IllegalStateException.class);
    }
}
