package com.cptbendova.rolecraftvault;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/** Private image bridge byte validation. No file paths or remote image URLs. */
final class ImageGenerationCodec {
    static final int MAX_REFERENCE = 4 * 1024 * 1024;
    static final int MAX_REFERENCES = 12 * 1024 * 1024;
    static final int MAX_RESULT = 20 * 1024 * 1024;
    static final int MAX_RESPONSE = 32 * 1024 * 1024;
    static final int MAX_REQUEST = 18 * 1024 * 1024;

    static final class Picture {
        final byte[] bytes;
        final String mime;
        Picture(byte[] bytes, String mime) { this.bytes = bytes; this.mime = mime; }
        String dataUrl() { return "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(bytes); }
    }

    static Picture reference(String value) throws IOException {
        if (value == null || value.length() > (MAX_REFERENCE + 2L) / 3 * 4 + 32)
            throw new IOException("Each reference must be a PNG, JPEG or WebP image no larger than 4 MiB.");
        int comma = value.indexOf(',');
        if (comma < 0) throw new IOException("Choose a local reference image, not a link.");
        String prefix = value.substring(0, comma);
        String mime;
        if (prefix.equals("data:image/png;base64")) mime = "image/png";
        else if (prefix.equals("data:image/jpeg;base64")) mime = "image/jpeg";
        else if (prefix.equals("data:image/webp;base64")) mime = "image/webp";
        else throw new IOException("References must be PNG, JPEG or WebP images.");
        byte[] decoded = decode(value.substring(comma + 1), MAX_REFERENCE);
        if (!mime.equals(sniff(decoded))) throw new IOException("Reference image data does not match its format.");
        return new Picture(decoded, mime);
    }

    static Picture result(String base64) throws IOException {
        byte[] decoded = decode(base64, MAX_RESULT);
        return new Picture(decoded, sniff(decoded));
    }

    static byte[] decode(String value, int maximum) throws IOException {
        if (value == null || value.isEmpty() || value.length() > (maximum + 2L) / 3 * 4 || value.length() % 4 != 0)
            throw new IOException("Image data is missing, invalid or too large.");
        int padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
        for (int i = 0; i < value.length() - padding; i++) {
            char c = value.charAt(i);
            if (!(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '+' || c == '/'))
                throw new IOException("Image data is invalid.");
        }
        try {
            byte[] bytes = Base64.getDecoder().decode(value);
            if (bytes.length == 0 || bytes.length > maximum) throw new IOException("Image data is too large.");
            return bytes;
        } catch (IllegalArgumentException error) { throw new IOException("Image data is invalid."); }
    }

    static String sniff(byte[] b) throws IOException {
        if (b.length >= 24 && (b[0] & 255) == 137 && b[1] == 80 && b[2] == 78 && b[3] == 71 && b[4] == 13 && b[5] == 10 && b[6] == 26 && b[7] == 10 && b[12] == 73 && b[13] == 72 && b[14] == 68 && b[15] == 82)
            return "image/png";
        if (b.length >= 4 && (b[0] & 255) == 255 && (b[1] & 255) == 216 && (b[2] & 255) == 255)
            return "image/jpeg";
        if (b.length >= 16 && b[0] == 82 && b[1] == 73 && b[2] == 70 && b[3] == 70 && b[8] == 87 && b[9] == 69 && b[10] == 66 && b[11] == 80 && b[12] == 86 && b[13] == 80 && b[14] == 56 && (b[15] == 32 || b[15] == 76 || b[15] == 88))
            return "image/webp";
        throw new IOException("The provider did not return a supported image.");
    }

    static String provider(String value) throws IOException {
        if (!"openai".equals(value) && !"xai".equals(value)) throw new IOException("Choose OpenAI or xAI.");
        return value;
    }

    static void model(String provider, String value) throws IOException {
        if (provider.equals("openai") && ("gpt-image-2.5-sunburst".equals(value) || "gpt-image-2.5-flare".equals(value) || "gpt-image-2".equals(value))) return;
        if (provider.equals("xai") && "grok-imagine-image-2.0".equals(value)) return;
        throw new IOException("Choose a supported image model for this provider.");
    }

    static String resolution(String value, boolean openai) throws IOException {
        if ("standard".equals(value)) return openai ? "standard" : "1k";
        if ("2k".equals(value)) return "2k";
        if (openai && "max".equals(value)) return "max";
        throw new IOException("Choose a supported resolution for this provider.");
    }

    static String shape(String value, String resolution, boolean openai) throws IOException {
        resolution(resolution, openai);
        int index;
        if ("square".equals(value)) index = 0;
        else if ("portrait".equals(value)) index = 1;
        else if ("landscape".equals(value)) index = 2;
        else if ("wide".equals(value)) index = 3;
        else if ("tall".equals(value)) index = 4;
        else throw new IOException("Choose square, portrait, landscape, wide or tall.");
        if (!openai) return new String[]{"1:1", "2:3", "3:2", "16:9", "9:16"}[index];
        // Exact provider output sizes, not local upscaling. 2:3 at a 3840px
        // long edge would exceed OpenAI's 8,294,400-pixel maximum.
        if (resolution.equals("max")) return new String[]{"2880x2880", "2336x3504", "3504x2336", "3840x2160", "2160x3840"}[index];
        if (resolution.equals("2k")) return new String[]{"2048x2048", "1344x2016", "2016x1344", "2048x1152", "1152x2048"}[index];
        return new String[]{"1024x1024", "1024x1536", "1536x1024", "1536x864", "864x1536"}[index];
    }

    static String quality(String value, boolean openai, String model) throws IOException {
        if ("auto".equals(value) || "low".equals(value) || "medium".equals(value) || openai && "high".equals(value)) return value;
        boolean latest = "gpt-image-2.5-sunburst".equals(model) || "gpt-image-2.5-flare".equals(model);
        if (openai && latest && ("xhigh".equals(value) || "max".equals(value))) return value;
        throw new IOException("Choose a supported quality for this provider.");
    }

    static String prompt(String value) throws IOException {
        if (value == null || value.trim().isEmpty() || value.length() > 8000) throw new IOException("Write a prompt between 1 and 8,000 characters.");
        return value.trim();
    }

    static String errorText(String value, String... secrets) {
        if (value == null || value.length() > 16384) return "";
        String text = value;
        for (String secret : secrets) if (secret != null && !secret.isEmpty()) text = text.replace(secret, "[redacted]");
        return text.replaceAll("(?i)data:[^\\s\"'<>]+", "[image data removed]")
            .replaceAll("(?i)https?://[^\\s\"'<>]+", "[link removed]")
            .replaceAll("(?i)\\b(?:sk-|xai-)[A-Za-z0-9_*.-]+", "[key removed]")
            .replaceAll("(?i)\\bBearer\\s+[^\\s\"'<>]+", "Bearer [redacted]")
            .replaceAll("[A-Za-z0-9_+/=-]{80,}", "[data removed]")
            .replaceAll("[\\x00-\\x1f\\x7f-\\x9f\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069]", " ")
            .replaceAll("\\s+", " ").trim();
    }
    private static String errorToken(String value, String pattern, String[] secrets) {
        return value != null && value.matches(pattern) && errorText(value, secrets).equals(value) ? value : "";
    }
    static String providerFailure(int status, String provider, String fallback, String message, String code, String type, String param, String requestId, String... secrets) {
        code = errorToken(code, "[A-Za-z0-9_.-]{1,80}", secrets);
        type = errorToken(type, "[A-Za-z0-9_.-]{1,80}", secrets);
        param = errorToken(param, "[A-Za-z0-9_.\\[\\]-]{1,80}", secrets);
        requestId = errorToken(requestId, "[A-Za-z0-9_-]{1,128}", secrets);
        message = errorText(message, secrets);
        if (status == 401 || status >= 300 && status < 400) message = "";
        if (code.equals("moderation_blocked") || code.equals("content_policy_violation") || code.equals("safety_violation"))
            message = "The provider blocked this request under its image safety policy. No image was saved.";
        if (message.length() > 900) {
            int end = Character.isHighSurrogate(message.charAt(899)) ? 899 : 900;
            message = message.substring(0, end) + "…";
        }
        return (provider.equals("xai") ? "xAI" : "OpenAI") + " (HTTP " + status + "): " + fallback
            + (message.isEmpty() ? "\nNo safe provider explanation was available." : "\n" + message)
            + (code.isEmpty() ? "" : "\nCode: " + code) + (type.isEmpty() ? "" : "\nType: " + type)
            + (param.isEmpty() ? "" : "\nParameter: " + param) + (requestId.isEmpty() ? "" : "\nRequest ID: " + requestId);
    }

    static byte[] multipart(String boundary, String model, String prompt, String size, String quality, Picture[] references) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        field(out, boundary, "model", model);
        field(out, boundary, "prompt", prompt);
        field(out, boundary, "size", size);
        field(out, boundary, "quality", quality);
        field(out, boundary, "n", "1");
        field(out, boundary, "output_format", "png");
        for (int i = 0; i < references.length; i++) {
            Picture image = references[i];
            String extension = image.mime.equals("image/jpeg") ? "jpg" : image.mime.substring(6);
            write(out, "--" + boundary + "\r\nContent-Disposition: form-data; name=\"image[]\"; filename=\"reference-" + (i + 1) + "." + extension + "\"\r\nContent-Type: " + image.mime + "\r\n\r\n");
            out.write(image.bytes);
            write(out, "\r\n");
        }
        write(out, "--" + boundary + "--\r\n");
        if (out.size() > MAX_REQUEST) throw new IOException("The image request is too large.");
        return out.toByteArray();
    }

    private static void field(ByteArrayOutputStream out, String boundary, String key, String value) throws IOException {
        write(out, "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + key + "\"\r\n\r\n" + value + "\r\n");
    }
    private static void write(ByteArrayOutputStream out, String text) throws IOException { out.write(text.getBytes(StandardCharsets.UTF_8)); }
}
