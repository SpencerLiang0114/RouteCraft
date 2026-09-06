package com.routecraft.api.routing.engine;

import java.io.*;
import java.util.*;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.ResolvableType;
import org.springframework.http.*;
import org.springframework.http.converter.*;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import com.routecraft.api.routing.RoutingController.RoutesResponse;

@Configuration
public class RoutingJsonConfiguration implements WebMvcConfigurer {
    @Override public void configureMessageConverters(HttpMessageConverters.ServerBuilder builder) {
        builder.configureMessageConvertersList(RoutingJsonConfiguration::instrument);
    }
    private static void instrument(List<HttpMessageConverter<?>> converters) {
        for (int i = 0; i < converters.size(); i++) {
            if (converters.get(i) instanceof JacksonJsonHttpMessageConverter jackson) {
                converters.add(i, new JacksonJsonHttpMessageConverter(jackson.getMapper()) {
                    @Override public boolean canRead(ResolvableType type, MediaType mediaType) { return false; }
                    @Override public boolean canWrite(ResolvableType type, Class<?> clazz, MediaType mediaType) {
                        return clazz == RoutesResponse.class && super.canWrite(type, clazz, mediaType);
                    }
                    @Override protected void writeInternal(Object body, ResolvableType type,
                            HttpOutputMessage output, Map<String, Object> hints) throws IOException {
                        try (var stage = RoutingTimings.stage("response_serialization", "spring", null)) {
                            long[] bytes = {0};
                            OutputStream counted = new FilterOutputStream(output.getBody()) {
                                @Override public void write(int b) throws IOException { out.write(b); bytes[0]++; }
                                @Override public void write(byte[] b, int off, int len) throws IOException { out.write(b, off, len); bytes[0] += len; }
                            };
                            try {
                                super.writeInternal(body, type, new HttpOutputMessage() {
                                    @Override public HttpHeaders getHeaders() { return output.getHeaders(); }
                                    @Override public OutputStream getBody() { return counted; }
                                }, hints);
                            } finally { stage.bytes(bytes[0]); }
                        }
                    }
                });
                break;
            }
        }
    }
}
