package com.cptbendova.rolecraftvault;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
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

/** Writes user-requested exports to public Downloads or picture collections.
 *
 * Capacitor Filesystem has no Downloads directory and its external-storage
 * option is unavailable on current scoped-storage Android. MediaStore is the
 * supported public path and also lets large JSON backups arrive in bounded
 * pieces instead of crossing the WebView bridge as one giant value. Individual
 * images use MediaStore.Images so Android Gallery apps can index them.
 */
@CapacitorPlugin(
    name = "FileExport",
    permissions = {
        @Permission(
            strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE },
            alias = "storage"
        )
    }
)
public class FileExportPlugin extends Plugin {

    private static final class ExportState {
        final Uri uri;
        final File file;
        final OutputStream stream;
        final String filename;
        final String mime;
        final String location;

        ExportState(Uri uri, File file, OutputStream stream, String filename, String mime, String location) {
            this.uri = uri;
            this.file = file;
            this.stream = stream;
            this.filename = filename;
            this.mime = mime;
            this.location = location;
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

    private File uniqueLegacyFile(String filename, boolean pictures) {
        File dir = Environment.getExternalStoragePublicDirectory(
            pictures ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS);
        if (pictures) dir = new File(dir, "Rolecraft Vault");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IllegalStateException((pictures ? "Pictures" : "Downloads") + " is unavailable");
        }
        File wanted = new File(dir, filename);
        if (!wanted.exists()) return wanted;
        int dot = filename.lastIndexOf('.');
        String stem = dot > 0 ? filename.substring(0, dot) : filename;
        String ext = dot > 0 ? filename.substring(dot) : "";
        for (int i = 2; i < 10000; i++) {
            File candidate = new File(dir, stem + " (" + i + ")" + ext);
            if (!candidate.exists()) return candidate;
        }
        throw new IllegalStateException((pictures ? "Pictures" : "Downloads") + " contains too many files with that name");
    }

    private ExportState openExport(String filename, String mime, boolean pictures) throws Exception {
        String location = pictures ? "Pictures/Rolecraft Vault" : "Downloads";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, pictures
                ? Environment.DIRECTORY_PICTURES + File.separator + "Rolecraft Vault"
                : Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = resolver.insert(pictures
                ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                : MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("Android could not create the download");
            OutputStream stream = resolver.openOutputStream(uri, "w");
            if (stream == null) {
                resolver.delete(uri, null, null);
                throw new IllegalStateException("Android could not open the download");
            }
            return new ExportState(uri, null, new BufferedOutputStream(stream), filename, mime, location);
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("Android has not allowed access to Downloads");
        }
        File file = uniqueLegacyFile(filename, pictures);
        return new ExportState(null, file, new BufferedOutputStream(new FileOutputStream(file)), file.getName(), mime, location);
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
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "afterStoragePermission");
            return;
        }
        beginExport(call);
    }

    @PermissionCallback
    private void afterStoragePermission(PluginCall call) {
        if (getPermissionState("storage") != PermissionState.GRANTED) {
            call.reject("Android has not allowed access to Downloads");
            return;
        }
        beginExport(call);
    }

    private void beginExport(final PluginCall call) {
        executor.submit(() -> {
            try {
                String filename = safeName(call.getString("filename"));
                String mime = mimeFor(filename, call.getString("mime"));
                boolean pictures = "pictures".equals(call.getString("collection")) && mime.startsWith("image/");
                ExportState state = openExport(filename, mime, pictures);
                String token = UUID.randomUUID().toString().replace("-", "");
                exports.put(token, state);
                JSObject result = new JSObject();
                result.put("token", token);
                result.put("filename", state.filename);
                result.put("location", state.location);
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
                    int published = getContext().getContentResolver().update(state.uri, values, null, null);
                    if (published != 1) throw new IllegalStateException("Android could not make the completed file visible in Downloads");
                }
                if (state.file != null && state.location.startsWith("Pictures")) {
                    MediaScannerConnection.scanFile(getContext(),
                        new String[] { state.file.getAbsolutePath() },
                        new String[] { state.mime }, null);
                }
                JSObject result = new JSObject();
                result.put("filename", state.filename);
                result.put("location", state.location);
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
