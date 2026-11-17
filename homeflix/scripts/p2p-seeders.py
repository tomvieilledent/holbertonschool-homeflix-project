#!/usr/bin/env python3
"""Compte les seeders d'un torrent auprès des trackers UDP publics (protocole « scrape »).

    python3 homeflix/scripts/p2p-seeders.py                     # Sintel (fichier P2P de démonstration)
    python3 homeflix/scripts/p2p-seeders.py <infohash>          # un autre torrent

À lancer la veille et le matin de la soutenance (voir docs/legal/P2P_DEMO.md). Aucune dépendance.
Un tracker injoignable est normal (certains sont hors service) : il suffit qu'un seul réponde.
"""
import random
import socket
import struct
import sys

SINTEL = "08ada5a7a6183aae1e09d831df6748d566095a10"
TRACKERS = [
    ("tracker.opentrackr.org", 1337),
    ("explodie.org", 6969),
    ("tracker.leechers-paradise.org", 6969),
    ("tracker.coppersurfer.tk", 6969),
]


def scrape(host, port, infohash):
    """Retourne (seeders, téléchargements terminés, leechers) d'après un tracker UDP (BEP 15)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(6)
    address = (host, port)
    # 1) connexion : identifiant magique du protocole, action 0
    transaction = random.getrandbits(32)
    sock.sendto(struct.pack(">QII", 0x41727101980, 0, transaction), address)
    reply, _ = sock.recvfrom(2048)
    _, _, connection_id = struct.unpack(">IIQ", reply[:16])
    # 2) scrape : action 2, suivie de l'infohash (20 octets)
    transaction = random.getrandbits(32)
    sock.sendto(struct.pack(">QII", connection_id, 2, transaction) + bytes.fromhex(infohash), address)
    reply, _ = sock.recvfrom(2048)
    _, _, seeders, completed, leechers = struct.unpack(">IIIII", reply[:20])
    return seeders, completed, leechers


def main():
    infohash = (sys.argv[1] if len(sys.argv) > 1 else SINTEL).lower()
    if len(infohash) != 40 or any(c not in "0123456789abcdef" for c in infohash):
        sys.exit("L'infohash doit faire 40 caractères hexadécimaux.")
    answered = 0
    for host, port in TRACKERS:
        try:
            seeders, completed, leechers = scrape(host, port, infohash)
            print(f"{host}:{port}  seeders={seeders} leechers={leechers} téléchargements terminés={completed}")
            answered += 1
        except OSError:
            print(f"{host}:{port}  injoignable")
    if answered == 0:
        sys.exit("Aucun tracker n'a répondu : réseau bloqué ? (voir le plan B dans docs/legal/P2P_DEMO.md)")


if __name__ == "__main__":
    main()
