package com.homeflix.library.index;

import java.io.EOFException;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Locale;

/**
 * Durée d'un fichier MP4 (`.mp4`, `.m4v`, `.mov`), lue dans la boîte `moov/mvhd`. Seuls les en-têtes sont lus : le
 * contenu vidéo n'est jamais chargé. Tout autre format, ou un fichier illisible ou malformé, donne {@code null}.
 */
public final class Mp4Duration {

    /** Garde-fou contre un fichier forgé : nombre maximal de boîtes parcourues à un même niveau. */
    private static final int MAX_BOXES = 1000;

    private record Box(long start, long end) { }

    private Mp4Duration() { }

    public static Integer read(Path file) {
        String name = String.valueOf(file.getFileName()).toLowerCase(Locale.ROOT);
        if (!name.endsWith(".mp4") && !name.endsWith(".m4v") && !name.endsWith(".mov")) {
            return null;
        }
        try (FileChannel channel = FileChannel.open(file, StandardOpenOption.READ)) {
            Box moov = find(channel, new Box(0, channel.size()), "moov");
            Box mvhd = moov == null ? null : find(channel, moov, "mvhd");
            return mvhd == null ? null : seconds(channel, mvhd);
        } catch (IOException e) {
            return null; // la durée est facultative : elle ne doit jamais faire échouer une indexation
        }
    }

    /** Contenu de la première boîte {@code type} située dans {@code parent}, ou {@code null}. */
    private static Box find(FileChannel channel, Box parent, String type) throws IOException {
        long position = parent.start();
        for (int i = 0; i < MAX_BOXES && position + 8 <= parent.end(); i++) {
            ByteBuffer header = read(channel, position, 8);
            long size = Integer.toUnsignedLong(header.getInt(0));
            String name = new String(header.array(), 4, 4, java.nio.charset.StandardCharsets.ISO_8859_1);
            long headerSize = 8;
            if (size == 1) { // taille sur 64 bits
                size = read(channel, position + 8, 8).getLong(0);
                headerSize = 16;
            } else if (size == 0) { // la boîte va jusqu'à la fin
                size = parent.end() - position;
            }
            if (size < headerSize || size > parent.end() - position) {
                return null;
            }
            if (name.equals(type)) {
                return new Box(position + headerSize, position + size);
            }
            position += size;
        }
        return null;
    }

    private static Integer seconds(FileChannel channel, Box mvhd) throws IOException {
        int version = read(channel, mvhd.start(), 1).get(0);
        long timescale;
        long duration;
        if (version == 1) {
            ByteBuffer fields = read(channel, mvhd.start() + 20, 12);
            timescale = Integer.toUnsignedLong(fields.getInt(0));
            duration = fields.getLong(4);
        } else {
            ByteBuffer fields = read(channel, mvhd.start() + 12, 8);
            timescale = Integer.toUnsignedLong(fields.getInt(0));
            duration = Integer.toUnsignedLong(fields.getInt(4));
            if (duration == 0xFFFF_FFFFL) {
                return null; // durée inconnue
            }
        }
        if (timescale == 0 || duration <= 0) {
            return null;
        }
        long seconds = Math.round((double) duration / timescale);
        return seconds > 0 && seconds <= Integer.MAX_VALUE ? (int) seconds : null;
    }

    private static ByteBuffer read(FileChannel channel, long position, int length) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(length);
        while (buffer.hasRemaining()) {
            if (channel.read(buffer, position + buffer.position()) < 0) {
                throw new EOFException();
            }
        }
        return buffer.flip();
    }
}
