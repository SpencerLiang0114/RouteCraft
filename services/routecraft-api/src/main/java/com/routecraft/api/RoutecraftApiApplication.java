package com.routecraft.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

import com.routecraft.api.config.RoutingProperties;

@SpringBootApplication
@EnableConfigurationProperties(RoutingProperties.class)
public class RoutecraftApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(RoutecraftApiApplication.class, args);
	}

}
