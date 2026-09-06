package com.routecraft.api.routing.engine;

import static org.junit.jupiter.api.Assertions.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class RustRoutingEngineTest {
    @Test void protocolErrorsAndCleanup() throws Exception {
        var mapper=JsonMapper.builder().build();
        for (String code : List.of("expired_handle","overload","timeout","malformed_input","no_route","insufficient_graph_data","broken_json","empty_json","null_json","wrong_version","invalid_candidate")) {
            var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var deletes=new AtomicInteger();String handle=UUID.randomUUID().toString();
            server.createContext("/",exchange->{
                exchange.getRequestBody().readAllBytes();
                if(exchange.getRequestMethod().equals("DELETE")){deletes.incrementAndGet();exchange.sendResponseHeaders(204,-1);exchange.close();return;}
                String response;int status=200;
                if(exchange.getRequestURI().getPath().endsWith("prepare")) response="{\"handle\":\""+handle+"\",\"nodePoints\":[{\"lat\":40,\"lng\":-74}],\"protocolVersion\":1}";
                else if(code.equals("broken_json"))response="{";
                else if(code.equals("empty_json"))response="";
                else if(code.equals("null_json"))response="null";
                else if(code.equals("wrong_version"))response="{\"protocolVersion\":2,\"candidates\":[]}";
                else if(code.equals("invalid_candidate"))response="{\"protocolVersion\":1,\"candidates\":[{}]}";
                else {status=code.equals("no_route")||code.equals("insufficient_graph_data")?422:503;response="{\"protocolVersion\":1,\"code\":\""+code+"\"}";}
                byte[] body=response.getBytes(java.nio.charset.StandardCharsets.UTF_8);exchange.sendResponseHeaders(status,body.length);exchange.getResponseBody().write(body);exchange.close();
            });server.start();
            try{
                var engine=new RustRoutingEngine(mapper,"http://127.0.0.1:"+server.getAddress().getPort(),1);
                try(var prepared=engine.prepare(List.of(),EngineFallbackTest.preferences())){
                    if(code.equals("no_route")||code.equals("insufficient_graph_data"))assertThrows(IllegalStateException.class,()->prepared.generate(Map.of()));
                    else assertThrows(EngineUnavailableException.class,()->prepared.generate(Map.of()));
                }
                assertEquals(1,deletes.get(),code);
            }finally{server.stop(0);}
        }
    }
    @Test void unavailableEngineIsRetryable(){
        var engine=new RustRoutingEngine(JsonMapper.builder().build(),"http://127.0.0.1:1",1);
        assertThrows(EngineUnavailableException.class,()->engine.prepare(List.of(),EngineFallbackTest.preferences()));
    }
}
