package com.mkstr.chat.opensearch;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.http.HttpClient;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;

final class OpenSearchHttpClientFactory {

    private OpenSearchHttpClientFactory() {
    }

    static HttpClient create(OpenSearchProperties props) {
        String url = props.getBaseUrl() != null ? props.getBaseUrl().toLowerCase() : "";
        if (url.startsWith("https://") && props.isInsecureSsl()) {
            System.setProperty("jdk.internal.httpclient.disableHostnameVerification", "true");
        }
        HttpClient.Builder b = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5));
        if (url.startsWith("https://") && props.isInsecureSsl()) {
            try {
                SSLContext ctx = SSLContext.getInstance("TLS");
                SSLParameters sslParameters = new SSLParameters();
                sslParameters.setEndpointIdentificationAlgorithm("");
                TrustManager[] trust = new TrustManager[]{
                        new X509TrustManager() {
                            @Override
                            public void checkClientTrusted(X509Certificate[] chain, String authType) {
                            }

                            @Override
                            public void checkServerTrusted(X509Certificate[] chain, String authType) {
                            }

                            @Override
                            public X509Certificate[] getAcceptedIssuers() {
                                return new X509Certificate[0];
                            }
                        }
                };
                ctx.init(null, trust, new SecureRandom());
                b.sslContext(ctx);
                b.sslParameters(sslParameters);
            } catch (Exception e) {
                throw new IllegalStateException("OpenSearch insecure SSL init failed", e);
            }
        }
        return b.build();
    }
}
