package com.routecraft.api.routing.engine;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.GZIPInputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.*;
import com.routecraft.api.routing.model.*;
import com.routecraft.api.routing.osm.*;

/** Real Spring HTTP, engine HTTP and PostGIS; only external providers are fixed. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties="spring.datasource.url=jdbc:postgresql://localhost:5432/routecraft_migration_test")
@EnabledIfSystemProperty(named="routecraft.integration",matches="true")
class MigrationIntegrationTest {
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate database;
    @MockitoSpyBean OverpassClient overpass;
    @MockitoSpyBean ElevationService elevation;
    @Value("${local.server.port}") int port;
    @Value("${routecraft.routing.engine}") String mode;

    @Test void fixtureMatrixThroughHttpAndPostgis() throws Exception {
        int samples=Integer.getInteger("routecraft.benchmark.samples",1);
        int warmups=Integer.getInteger("routecraft.benchmark.warmups",0);
        var client=HttpClient.newHttpClient();
        var rows=new ArrayList<Map<String,Object>>();
        var firstEncounters=new ArrayList<Map<String,Object>>();
        Path output=Path.of("../routing-compat/results");Files.createDirectories(output);
        Files.writeString(output.resolve(mode+"-integration.pid"),Long.toString(ProcessHandle.current().pid()));
        for(String area:List.of("urban","park","hilly")) {
            var input=mapper.readTree(Files.readString(CompatibilityFixturesTest.FIXTURES.resolve(area+".json")));
            var elements=overpass.parseElementsNode(input.get("elements"));
            doAnswer(call->elements).when(overpass).fetch(any(BBox.class));
            for(ActivityType activity:ActivityType.values()) for(RouteType type:RouteType.values()) for(int variant=0;variant<2;variant++) {
                String name=area+"-"+activity.value()+"-"+type.value()+"-"+variant;
                JsonNode reference;
                try(var in=new GZIPInputStream(Files.newInputStream(CompatibilityFixturesTest.FIXTURES.resolve(name+".reference.json.gz")))){reference=mapper.readTree(in);}
                UserPreferences prefs=mapper.treeToValue(reference.get("preferences"),UserPreferences.class);
                Map<String,Double> elevations=new HashMap<>();reference.get("elevations").properties().forEach(e->elevations.put(e.getKey(),e.getValue().asDouble()));
                doAnswer(call->{
                    List<LatLng> points=call.getArgument(0);Map<String,Double> result=new HashMap<>();
                    for(var point:points){String key=ElevationService.nodeKey(point);if(elevations.containsKey(key))result.put(key,elevations.get(key));}
                    return result;
                }).when(elevation).fetchElevations(anyList());
                byte[] request=mapper.writeValueAsBytes(prefs);
                JsonNode first=null;
                for(int run=-warmups;run<samples;run++) {
                    long before=database.queryForObject("select count(*) from generated_route_batches",Long.class);
                    long started=System.nanoTime();
                    var response=client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/routing/generate")).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofByteArray(request)).build(),HttpResponse.BodyHandlers.ofByteArray());
                    double elapsed=(System.nanoTime()-started)/1e6;
                    long after=database.queryForObject("select count(*) from generated_route_batches",Long.class);
                    JsonNode body=mapper.readTree(response.body());
                    if(reference.get("candidates").isEmpty()){assertEquals(500,response.statusCode(),name);assertEquals(before,after,name);}
                    else {
                        assertEquals(200,response.statusCode(),name+": "+body);assertEquals(before+1,after,name);
                        var routes=body.get("routes");assertEquals(reference.get("candidates").size(),routes.size(),name);
                        for(int i=0;i<routes.size();i++){
                            assertEquals(reference.get("candidates").get(i).get("id"),routes.get(i).get("id"),name);
                            var expectedGeometry=reference.get("candidates").get(i).get("geometry");
                            var actualGeometry=routes.get(i).get("geometry");assertEquals(expectedGeometry.size(),actualGeometry.size(),name);
                            for(int j=0;j<expectedGeometry.size();j++)for(String coordinate:List.of("lat","lng"))assertEquals(expectedGeometry.get(j).get(coordinate).asDouble(),actualGeometry.get(j).get(coordinate).asDouble(),1e-6,name);
                        }
                        if(first==null)first=body;else assertEquals(first,body,name);
                        assertTrue(database.queryForObject("select count(*) from generated_route_candidates where ST_SRID(geometry)=4326",Long.class)>0);
                    }
                    if(run==-warmups)firstEncounters.add(Map.of("fixture",name,"routeType",type.value(),"elapsedMs",elapsed,"status",response.statusCode()));
                    if(run>=0)rows.add(Map.of("fixture",name,"routeType",type.value(),"engine",mode,"sample",run,"elapsedMs",elapsed,"status",response.statusCode(),"requestBytes",request.length,"responseBytes",response.body().length));
                }
            }
        }
        Files.writeString(output.resolve(mode+"-integration.json"),mapper.writeValueAsString(rows));
        Files.writeString(output.resolve(mode+"-first-encounters.json"),mapper.writeValueAsString(firstEncounters));
    }
}
