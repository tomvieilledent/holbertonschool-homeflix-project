package com.homeflix.identity.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Component;

/**
 * Limitation des tentatives de connexion, en mémoire : 5 échecs en 5 minutes pour un même identifiant, 20 pour une
 * même adresse IP (plus large : plusieurs foyers peuvent partager une adresse). Au-delà, les tentatives sont
 * refusées jusqu'à ce que l'échec le plus ancien sorte de la fenêtre.
 *
 * <p>Le refus ne dépend que de l'identifiant saisi, jamais de l'existence du compte : la réponse est la même pour
 * un compte inconnu. Une connexion réussie remet à zéro le compteur de l'identifiant (pas celui de l'IP, sinon un
 * attaquant le réinitialiserait avec son propre compte).
 *
 * <p>Limite assumée (MVP) : l'état est perdu au redémarrage et n'est pas partagé entre instances ; une seule
 * instance d'Identity tourne.
 */
@Component
public class LoginThrottle {

    static final int MAX_FAILURES_PER_USER = 5;
    static final int MAX_FAILURES_PER_IP = 20;
    static final Duration WINDOW = Duration.ofMinutes(5);
    /** Borne la mémoire : au-delà, les entrées expirées sont purgées, puis les plus anciennes écartées. */
    private static final int MAX_KEYS = 10_000;

    private final Clock clock;
    private final Map<String, Deque<Instant>> byUser = new HashMap<>();
    private final Map<String, Deque<Instant>> byIp = new HashMap<>();

    public LoginThrottle(Clock clock) {
        this.clock = clock;
    }

    /** Durée à attendre avant une nouvelle tentative, ou {@code null} si elle est autorisée. */
    public synchronized Duration retryAfter(String username, String ip) {
        Instant now = clock.instant();
        Duration user = remaining(byUser, userKey(username), MAX_FAILURES_PER_USER, now);
        Duration addr = remaining(byIp, ip, MAX_FAILURES_PER_IP, now);
        if (user == null) {
            return addr;
        }
        return addr == null || user.compareTo(addr) >= 0 ? user : addr;
    }

    public synchronized void recordFailure(String username, String ip) {
        Instant now = clock.instant();
        if (byUser.size() > MAX_KEYS || byIp.size() > MAX_KEYS) {
            purge(now);
        }
        byUser.computeIfAbsent(userKey(username), k -> new ArrayDeque<>()).addLast(now);
        byIp.computeIfAbsent(ip, k -> new ArrayDeque<>()).addLast(now);
    }

    public synchronized void reset(String username) {
        byUser.remove(userKey(username));
    }

    private Duration remaining(Map<String, Deque<Instant>> map, String key, int max, Instant now) {
        Deque<Instant> failures = map.get(key);
        if (failures == null) {
            return null;
        }
        evict(failures, now);
        if (failures.isEmpty()) {
            map.remove(key);
            return null;
        }
        if (failures.size() < max) {
            return null;
        }
        Duration wait = Duration.between(now, failures.peekFirst().plus(WINDOW));
        return wait.isNegative() || wait.isZero() ? Duration.ofSeconds(1) : wait;
    }

    private static void evict(Deque<Instant> failures, Instant now) {
        Instant limit = now.minus(WINDOW);
        while (!failures.isEmpty() && !failures.peekFirst().isAfter(limit)) {
            failures.pollFirst();
        }
    }

    private void purge(Instant now) {
        for (Map<String, Deque<Instant>> map : java.util.List.of(byUser, byIp)) {
            map.values().removeIf(d -> {
                evict(d, now);
                return d.isEmpty();
            });
            if (map.size() > MAX_KEYS) {
                map.clear(); // attaque massive par identifiants distincts : on repart de zéro plutôt que de saturer la mémoire
            }
        }
    }

    private static String userKey(String username) {
        String key = username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
        return key.length() > 254 ? key.substring(0, 254) : key;
    }
}
