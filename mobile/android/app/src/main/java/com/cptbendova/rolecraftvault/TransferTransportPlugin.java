package com.cptbendova.rolecraftvault;

import android.os.StatFs;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Streams LAN transfer responses to private temporary files.
 *
 * CapacitorHttp materialises a response as byte[], copies it, base64-encodes it,
 * and then asks the WebView to decode it again. That is expensive enough to kill
 * a large vault copy. This plugin keeps the network response out of the bridge;
 * JavaScript reads bounded pieces only after the download has safely completed.
 */
@CapacitorPlugin(name = "TransferTransport")
public class TransferTransportPlugin extends Plugin {

    private static final int MAX_READ = 512 * 1024;
    private final Map<String, File> files = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private File transferDir() {
        File dir = new File(getContext().getCacheDir(), "rolecraft-transfer");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private URL checkedUrl(String value) throws Exception {
        URL url = new URL(value == null ? "" : value);
        if (!"http".equalsIgnoreCase(url.getProtocol())) throw new IllegalArgumentException("Only local HTTP is allowed");
        InetAddress address = InetAddress.getByName(url.getHost());
        if (!address.isSiteLocalAddress() && !address.isLoopbackAddress()) {
            throw new IllegalArgumentException("The transfer address is not on the local network");
        }
        return url;
    }

    @PluginMethod
    public void download(final PluginCall call) {
        executor.submit(() -> {
            HttpURLConnection connection = null;
            File out = null;
            try {
                URL url = checkedUrl(call.getString("url"));
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(call.getInt("connectTimeout", 30000));
                connection.setReadTimeout(call.getInt("readTimeout", 30000));
                connection.setUseCaches(false);
                connection.connect();
                int status = connection.getResponseCode();
                if (status != 200) throw new IllegalStateException("status " + status);

                String token = UUID.randomUUID().toString().replace("-", "");
                out = new File(transferDir(), token + ".bin");
                long total = 0;
                byte[] buffer = new byte[64 * 1024];
                try (BufferedInputStream in = new BufferedInputStream(connection.getInputStream());
                     BufferedOutputStream dest = new BufferedOutputStream(new FileOutputStream(out))) {
                    int n;
                    while ((n = in.read(buffer)) != -1) {
                        dest.write(buffer, 0, n);
                        total += n;
                    }
                }
                files.put(token, out);
                JSObject result = new JSObject();
                result.put("token", token);
                result.put("size", total);
                call.resolve(result);
            } catch (Exception e) {
                if (out != null) out.delete();
                call.reject(e.getMessage() == null ? "Download failed" : e.getMessage(), e);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    @PluginMethod
    public void read(PluginCall call) {
        String token = call.getString("token", "");
        File file = files.get(token);
        if (file == null || !file.isFile()) {
            call.reject("Transfer download not found");
            return;
        }
        long offset = Math.max(0L, call.getLong("offset", 0L));
        int requested = Math.max(0, Math.min(MAX_READ, call.getInt("length", MAX_READ)));
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            if (offset > input.length()) throw new IllegalArgumentException("Read offset is outside the transfer file");
            int count = (int) Math.min((long) requested, input.length() - offset);
            byte[] data = new byte[count];
            input.seek(offset);
            input.readFully(data);
            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(data, Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Read failed" : e.getMessage(), e);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String token = call.getString("token", "");
        File file = files.remove(token);
        if (file != null) file.delete();
        call.resolve();
    }

    @PluginMethod
    public void freeSpace(PluginCall call) {
        StatFs stat = new StatFs(getContext().getFilesDir().getAbsolutePath());
        JSObject result = new JSObject();
        result.put("bytes", stat.getAvailableBytes());
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        for (File file : files.values()) file.delete();
        files.clear();
        super.handleOnDestroy();
    }
}
