package com.routecraft.api.routing.engine;
import java.io.*;
import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;
import com.routecraft.api.routing.graph.*;
import com.routecraft.api.routing.model.*;
import com.routecraft.api.routing.osm.*;

/** JSONL benchmark driver. Input parsing and output encoding are outside CPU stages. */
public class CpuBenchmark {
    public static void main(String[] args) throws Exception {
        ObjectMapper mapper=JsonMapper.builder().build();var parser=new OverpassClient(mapper);
        var reader=new BufferedReader(new InputStreamReader(System.in));String line;
        while((line=reader.readLine())!=null){
            JsonNode input=mapper.readTree(line);var elements=parser.parseElementsNode(input.get("elements"));var p=mapper.treeToValue(input.get("preferences"),UserPreferences.class);
            Map<String,Double> elevations=new HashMap<>();input.get("elevations").properties().forEach(e->elevations.put(e.getKey(),e.getValue().asDouble()));
            long t=System.nanoTime();var raw=OsmGraphBuilder.createEdges(elements,OsmGraphBuilder.getGreenFeatures(elements),Map.of(),p);var draft=OsmGraphBuilder.trimToLocalGraph(p.startPoint(),raw.nodes(),raw.edges(),p);double prepare=(System.nanoTime()-t)/1e6;
            t=System.nanoTime();var edges=OsmGraphBuilder.applyElevationsToEdges(draft.edges(),elevations);var start=OsmGraphBuilder.addAnchorNode("user-start",p.startPoint(),draft.nodes(),edges);var end=OsmGraphBuilder.addAnchorNode("user-end",p.endPoint(),start.nodes(),start.edges());var graph=new RouteGraph(end.nodes(),RouteGraph.bidirectional(end.edges()));double finalize=(System.nanoTime()-t)/1e6;
            t=System.nanoTime();var result=JavaRoutingEngine.selectTopRoutes(p,graph);double generation=(System.nanoTime()-t)/1e6;
            System.out.println(mapper.writeValueAsString(Map.of("prepareMs",prepare,"finalizeMs",finalize,"generateMs",generation,"cpuStagesMs",prepare+finalize+generation,"candidates",result.size())));
        }
    }
}
