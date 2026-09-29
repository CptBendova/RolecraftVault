package com.cptbendova.rolecraftvault;

import java.io.IOException;
import java.util.regex.Pattern;

/** Pure validation for ElevenLabs voices (1.339). Mirrors app/elevenlabs.js. */
final class ElevenLabsCodec {
    static final String HOST = "https://api.elevenlabs.io";
    static final String OUTPUT_FORMAT = "mp3_44100_128";
    static final int MAX_TEXT = 4000;
    static final int MAX_AUDIO = 16 * 1024 * 1024;
    static final int MAX_VOICES_RESPONSE = 2 * 1024 * 1024;
    static final int MAX_ERROR = 64 * 1024;
    private static final Pattern VOICE_ID = Pattern.compile("[A-Za-z0-9]{8,64}");
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_=.+/-]{1,512}");
    private static final Pattern CATEGORY = Pattern.compile("[a-z_]{1,40}");
    private static final Pattern KEY = Pattern.compile("[!-~]{16,512}");

    private ElevenLabsCodec() {}

    static String key(String value) throws IOException {
        String key = value == null ? "" : value.trim();
        if (!KEY.matcher(key).matches()) throw new IOException("Enter a valid ElevenLabs API key.");
        return key;
    }
    static String model(String value) throws IOException {
        if (value == null || value.isEmpty()) return "eleven_v4";
        if (value.equals("eleven_v4") || value.equals("eleven_v4_turbo")) return value;
        throw new IOException("Choose Eleven v4 or Eleven v4 Turbo.");
    }
    static String voiceId(String value) throws IOException {
        if (value == null || !VOICE_ID.matcher(value).matches()) throw new IOException("Choose an ElevenLabs voice for this character first.");
        return value;
    }
    static boolean validVoiceId(String value) { return value != null && VOICE_ID.matcher(value).matches(); }
    static String text(String value) throws IOException {
        if (value == null || value.trim().isEmpty() || value.length() > MAX_TEXT) throw new IOException("Choose a reply under 4,000 characters to voice.");
        return value;
    }
    static String search(String value) throws IOException {
        if (value == null || value.isEmpty()) return "";
        if (value.length() > 100) throw new IOException("Search for a voice with at most 100 characters.");
        return value.trim();
    }
    static String pageToken(String value) throws IOException {
        if (value == null || value.isEmpty()) return "";
        if (!TOKEN.matcher(value).matches()) throw new IOException("Invalid voice list page.");
        return value;
    }
    static String responseToken(String value) { return value != null && TOKEN.matcher(value).matches() ? value : ""; }
    static String category(String value) { return value != null && CATEGORY.matcher(value).matches() ? value : ""; }

    /** MP3 with an ID3 tag or an MPEG audio frame header. */
    static boolean isMp3(byte[] data, String contentType) {
        String declared = contentType == null ? "" : contentType.split(";", 2)[0].trim().toLowerCase(java.util.Locale.ROOT);
        if (!declared.equals("audio/mpeg") || data == null || data.length < 128) return false;
        if (data[0] == 'I' && data[1] == 'D' && data[2] == '3') return true;
        return (data[0] & 0xff) == 0xff && (data[1] & 0xe0) == 0xe0;
    }

    /** Plain display text: no control or bidi characters, no links. */
    static String plain(String value, int max) {
        if (value == null) return "";
        String text = value.replaceAll("(?i)https?://[^\\s\"'<>]+", "")
            .replaceAll("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069]", " ")
            .replaceAll("\\s+", " ").trim();
        if (text.length() <= max) return text;
        String cut = text.substring(0, max);
        if (Character.isHighSurrogate(cut.charAt(cut.length() - 1))) cut = cut.substring(0, cut.length() - 1);
        return cut + "…";
    }

    static String httpFailure(int code) {
        if (code == 401) return "ElevenLabs rejected the API key. Check the key in Chat connection settings.";
        if (code == 402) return "Your ElevenLabs plan or credit does not cover this request.";
        if (code == 403) return "This ElevenLabs account cannot use that voice, model or privacy mode.";
        if (code == 404) return "ElevenLabs could not find this voice. Choose it again in the character's voice settings.";
        if (code == 429) return "ElevenLabs reached its rate, concurrency or quota limit. Try again later; nothing was retried.";
        if (code >= 300 && code < 400) return "ElevenLabs requested a redirect. It was blocked to protect your API key.";
        if (code >= 500) return "ElevenLabs is temporarily unavailable. Try again later; nothing was retried.";
        return "ElevenLabs rejected the request (HTTP " + code + ").";
    }

    /** Status wording plus a sanitised provider detail. Never echoes 401/redirect bodies. */
    static String providerFailure(int code, String detail, String... secrets) {
        String message = "";
        if (code != 401 && !(code >= 300 && code < 400) && detail != null) {
            message = detail;
            for (String secret : secrets) if (secret != null && !secret.isEmpty()) message = message.replace(secret, "[redacted]");
            message = message.replaceAll("(?i)\\b(?:sk|xi)[_-][A-Za-z0-9_-]+", "[key removed]")
                .replaceAll("[A-Za-z0-9_+/=-]{80,}", "[data removed]");
            message = plain(message, 400);
        }
        return httpFailure(code) + (message.isEmpty() ? "" : "\n" + message);
    }
}
