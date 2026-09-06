package com.routecraft.api.routing.engine;

/** Retryable internal-engine failure. Never exposed as a public provider error. */
public final class EngineUnavailableException extends RuntimeException {
    public EngineUnavailableException(String reason) { super(reason); }
}
