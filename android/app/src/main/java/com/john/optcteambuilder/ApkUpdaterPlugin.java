package com.john.optcteambuilder;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Downloads a release APK inside the app and hands it to the system package
 * installer.
 *
 * The download runs here rather than in the WebView on purpose: the release APK is
 * ~200 MB, and buffering that through JavaScript (fetch + getReader, accumulating
 * chunks, then a Blob) would hold the whole payload in the WebView heap and OOM on
 * a lot of devices. Streaming straight to a file costs one 64 KB buffer, and it is
 * also the only way to get honest byte-level progress, which the update banner's
 * progress bar consumes.
 *
 * Installation itself is still the user's decision: the intent opens Android's
 * package installer, which shows its own confirmation.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String DOWNLOAD_DIRECTORY = "updates";
    private static final String APK_MIME_TYPE = "application/vnd.android.package-archive";
    private static final int BUFFER_BYTES = 64 * 1024;
    private static final int MAX_REDIRECTS = 5;
    private static final int CONNECT_TIMEOUT_MS = 30_000;
    private static final int READ_TIMEOUT_MS = 60_000;

    /** Progress is throttled to whichever of these comes first, to spare the bridge. */
    private static final long PROGRESS_MIN_BYTES = 512 * 1024;
    private static final long PROGRESS_MIN_INTERVAL_MS = 200;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    /**
     * Streams `url` to the app's cache directory, emitting `downloadProgress` events
     * as it goes, and resolves with the absolute path of the finished file.
     */
    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");

        if (url == null || url.trim().isEmpty()) {
            call.reject("A download url is required.");
            return;
        }

        final String fileName = sanitizeFileName(call.getString("fileName"));
        final long expectedBytes = call.getLong("expectedBytes", 0L);

        call.setKeepAlive(true);
        executor.execute(() -> runDownload(call, url, fileName, expectedBytes));
    }

    /** Opens the system package installer for a previously downloaded file. */
    @PluginMethod
    public void install(PluginCall call) {
        final String path = call.getString("path");

        if (path == null || path.trim().isEmpty()) {
            call.reject("An apk path is required.");
            return;
        }

        final File file = new File(path);

        if (!file.exists()) {
            call.reject("Downloaded apk is missing: " + path);
            return;
        }

        try {
            final Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );
            final Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, APK_MIME_TYPE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            final Activity activity = getActivity();

            if (activity != null) {
                activity.startActivity(intent);
            } else {
                getContext().startActivity(intent);
            }

            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to open the package installer: " + error.getMessage(), error);
        }
    }

    /**
     * Whether this app may request package installs.
     *
     * From Android 8 the REQUEST_INSTALL_PACKAGES manifest permission is not enough
     * on its own — the user also has to allow this specific app to install unknown
     * apps, which is a settings screen rather than a runtime prompt.
     */
    @PluginMethod
    public void canInstall(PluginCall call) {
        final JSObject result = new JSObject();
        result.put("granted", hasInstallPermission());
        call.resolve(result);
    }

    /** Sends the user to the "install unknown apps" screen for this app. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }

        try {
            final Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to open install settings: " + error.getMessage(), error);
        }
    }

    private boolean hasInstallPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return true;
        }

        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    private void runDownload(PluginCall call, String url, String fileName, long expectedBytes) {
        HttpURLConnection connection = null;

        try {
            final File targetDirectory = new File(getContext().getCacheDir(), DOWNLOAD_DIRECTORY);
            // A previous attempt may have left a partial or superseded apk behind, and
            // these are ~200 MB each.
            deleteDirectoryContents(targetDirectory);

            if (!targetDirectory.exists() && !targetDirectory.mkdirs()) {
                call.reject("Unable to create the download directory.");
                return;
            }

            connection = openConnectionFollowingRedirects(url);
            final int status = connection.getResponseCode();

            if (status < 200 || status >= 300) {
                call.reject("Download failed with HTTP " + status);
                return;
            }

            final long reportedBytes = connection.getContentLengthLong();
            // The GitHub release API knows the asset size exactly; a CDN header may be
            // absent or wrong, so the caller's value wins when it has one.
            final long totalBytes = expectedBytes > 0 ? expectedBytes : reportedBytes;

            final File target = new File(targetDirectory, fileName);
            long written = 0;
            long lastEmittedBytes = 0;
            long lastEmittedAt = 0;

            try (InputStream input = connection.getInputStream();
                 OutputStream output = new FileOutputStream(target)) {
                final byte[] buffer = new byte[BUFFER_BYTES];
                int read;

                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    written += read;

                    final long now = System.currentTimeMillis();
                    final boolean enoughBytes = written - lastEmittedBytes >= PROGRESS_MIN_BYTES;
                    final boolean enoughTime = now - lastEmittedAt >= PROGRESS_MIN_INTERVAL_MS;

                    if (enoughBytes || enoughTime) {
                        lastEmittedBytes = written;
                        lastEmittedAt = now;
                        emitProgress(written, totalBytes);
                    }
                }

                output.flush();
            }

            // Always land on a final, exact reading rather than whatever the throttle
            // last let through.
            emitProgress(written, totalBytes > 0 ? totalBytes : written);

            if (totalBytes > 0 && written != totalBytes) {
                target.delete();
                call.reject("Download truncated: expected " + totalBytes + " bytes, received " + written);
                return;
            }

            final JSObject result = new JSObject();
            result.put("path", target.getAbsolutePath());
            result.put("bytes", written);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Download failed: " + error.getMessage(), error);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }

            call.setKeepAlive(false);
        }
    }

    /**
     * Opens `url`, following redirects manually.
     *
     * HttpURLConnection will not follow a redirect that changes protocol, and GitHub
     * release downloads redirect to a separate object host, so this cannot rely on
     * the built-in behaviour.
     */
    private HttpURLConnection openConnectionFollowingRedirects(String url) throws IOException {
        String currentUrl = url;

        for (int redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
            final HttpURLConnection connection = (HttpURLConnection) new URL(currentUrl).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setRequestProperty("Accept", "application/octet-stream");

            final int status = connection.getResponseCode();
            final boolean isRedirect =
                status == HttpURLConnection.HTTP_MOVED_PERM ||
                status == HttpURLConnection.HTTP_MOVED_TEMP ||
                status == HttpURLConnection.HTTP_SEE_OTHER ||
                status == 307 ||
                status == 308;

            if (!isRedirect) {
                return connection;
            }

            final String location = connection.getHeaderField("Location");
            connection.disconnect();

            if (location == null || location.trim().isEmpty()) {
                throw new IOException("Redirect without a Location header.");
            }

            currentUrl = new URL(new URL(currentUrl), location).toString();
        }

        throw new IOException("Too many redirects while downloading the update.");
    }

    private void emitProgress(long loaded, long total) {
        final JSObject payload = new JSObject();
        payload.put("loaded", loaded);
        payload.put("total", total);
        notifyListeners("downloadProgress", payload);
    }

    private void deleteDirectoryContents(File directory) {
        if (!directory.isDirectory()) {
            return;
        }

        final File[] entries = directory.listFiles();

        if (entries == null) {
            return;
        }

        for (File entry : entries) {
            if (entry.isDirectory()) {
                deleteDirectoryContents(entry);
            }

            entry.delete();
        }
    }

    /** Keeps the download inside the target directory whatever the caller passes. */
    private String sanitizeFileName(String requested) {
        if (requested == null || requested.trim().isEmpty()) {
            return "update.apk";
        }

        final String stripped = new File(requested).getName().replaceAll("[^A-Za-z0-9._-]", "_");

        return stripped.isEmpty() ? "update.apk" : stripped;
    }
}
