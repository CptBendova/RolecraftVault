package com.cptbendova.rolecraftvault;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Writes user-requested exports to the public Downloads collection.
 *
 * Capacitor Filesystem has no Downloads directory and its external-storage
 * option is unavailable on current scoped-storage Android. MediaStore is the
 * supported public-download path and also lets large JSON backups arrive in
 * bounded pieces instead of crossing the WebView bridge as one giant value.
 */
@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {

    private static final class ExportState {
        final Uri uri;
        final File file;
        final OutputStream stream;
        final String filename;

        ExportState(Uri uri, File file, OutputStream stream, String filename) {
            this.uri = uri;
            this.file = file;
            this.stream = stream;
            this.filename = filename;
        }
    }

    private final Map<String, ExportState> exports = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private String safeName(String value) {
        String name = value == null ? "rolecraft-export.json" : new File(value).getName();
        name = name.replaceAll("[\\x00-\\x1f\\\\/:*?\"<>|]", "_").trim();
        return name.isEmpty() ? "rolecraft-export.json" : name;
    }

    private String mimeFor(String name, String asked) {
        if (asked != null && !asked.trim().isEmpty()) return asked;
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
        if (lower.endsWith(".zip")) return "application/zip";
        return "application/octet-stream";
    }

    private File uniqueLegacyFile(String filename) {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Downloads is unavailable");
        File wanted = new File(dir, filename);
        if (!wanted.exists()) return wanted;
        int dot = filename.lastIndexOf('.');
        String stem = dot > 0 ? filename.substring(0, dot) : filename;
        String ext = dot > 0 ? filename.substring(dot) : "";
        for (int i = 2; i < 10000; i++) {
            File candidate = new File(dir, stem + " (" + i + ")" + ext);
            if (!candidate.exists()) return candidate;
        }
        throw new IllegalStateException("Downloads contains too many files with that name");
    }

    private ExportState openExport(String filename, String mime) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("Android could not create the download");
            OutputStream stream = resolver.openOutputStream(uri, "w");
            if (stream == null) {
                resolver.delete(uri, null, null);
                throw new IllegalStateException("Android could not open the download");
            }
            return new ExportState(uri, null, new BufferedOutputStream(stream), filename);
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("Android has not allowed access to Downloads");
        }
        File file = uniqueLegacyFile(filename);
        return new ExportState(null, file, new BufferedOutputStream(new FileOutputStream(file)), file.getName());
    }

    private void removeState(ExportState state) {
        if (state == null) return;
        try { state.stream.close(); } catch (Exception ignored) {}
        if (state.uri != null) {
            try { getContext().getContentResolver().delete(state.uri, null, null); } catch (Exception ignored) {}
        }
        if (state.file != null) {
            try { state.file.delete(); } catch (Exception ignored) {}
        }
    }

    @PluginMethod
    public void begin(final PluginCall call) {
        executor.submit(() -> {
            try {
                String filename = safeName(call.getString("filename"));
                ExportState state = openExport(filename, mimeFor(filename, call.getString("mime")));
                String token = UUID.randomUUID().toString().replace("-", "");
                exports.put(token, state);
                JSObject result = new JSObject();
                result.put("token", token);
                result.put("filename", state.filename);
                result.put("location", "Downloads");
                call.resolve(result);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Could not create the download" : e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void append(final PluginCall call) {
        executor.submit(() -> {
            ExportState state = exports.get(call.getString("token", ""));
            if (state == null) { call.reject("That export is no longer open"); return; }
            try {
                String data = call.getString("data", "");
                byte[] bytes = "base64".equals(call.getString("encoding"))
                    ? Base64.decode(data, Base64.DEFAULT)
                    : data.getBytes(StandardCharsets.UTF_8);
                state.stream.write(bytes);
                call.resolve();
            } catch (Exception e) {
                exports.remove(call.getString("token", ""));
                removeState(state);
                call.reject(e.getMessage() == null ? "Could not write the download" : e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void finish(final PluginCall call) {
        executor.submit(() -> {
            String token = call.getString("token", "");
            ExportState state = exports.remove(token);
            if (state == null) { call.reject("That export is no longer open"); return; }
            try {
                state.stream.flush();
                state.stream.close();
                if (state.uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContext().getContentResolver().update(state.uri, values, null, null);
                }
                JSObject result = new JSObject();
                result.put("filename", state.filename);
                result.put("location", "Downloads");
                call.resolve(result);
            } catch (Exception e) {
                removeState(state);
                call.reject(e.getMessage() == null ? "Could not finish the download" : e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void abort(PluginCall call) {
        ExportState state = exports.remove(call.getString("token", ""));
        removeState(state);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        for (ExportState state : exports.values()) removeState(state);
        exports.clear();
        super.handleOnDestroy();
    }
}
