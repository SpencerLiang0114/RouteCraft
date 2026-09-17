package com.routecraft.api.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

class RoutingPropertiesTest {

	private static Validator validator;

	@BeforeAll
	static void setUpValidator() {
		ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
		validator = factory.getValidator();
	}

	@Test
	void acceptsJavaAndRustEngines() {
		assertTrue(validator.validate(new RoutingProperties("java", "http://localhost:8090", 30)).isEmpty());
		assertTrue(validator.validate(new RoutingProperties("rust", "http://routecraft-engine:8090", 1)).isEmpty());
	}

	@Test
	void rejectsInvalidEngine() {
		Set<ConstraintViolation<RoutingProperties>> violations =
				validator.validate(new RoutingProperties("python", "http://localhost:8090", 30));
		assertFalse(violations.isEmpty());
	}

	@Test
	void rejectsBlankEngineUrl() {
		Set<ConstraintViolation<RoutingProperties>> violations =
				validator.validate(new RoutingProperties("rust", "  ", 30));
		assertFalse(violations.isEmpty());
	}

	@Test
	void rejectsNonPositiveBudget() {
		assertFalse(validator.validate(new RoutingProperties("rust", "http://localhost:8090", 0)).isEmpty());
		assertFalse(validator.validate(new RoutingProperties("rust", "http://localhost:8090", -5)).isEmpty());
	}
}
