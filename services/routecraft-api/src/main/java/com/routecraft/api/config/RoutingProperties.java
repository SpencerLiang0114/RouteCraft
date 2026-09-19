package com.routecraft.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

@ConfigurationProperties(prefix = "routecraft.routing")
@Validated
public record RoutingProperties(
		@NotBlank
		@Pattern(regexp = "java|rust")
		String engine,
		@NotBlank
		String engineUrl,
		@Positive
		long engineBudgetSeconds) {
}
