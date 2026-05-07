FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace

COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -q -DskipTests dependency:go-offline

COPY src src
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/target/routecraft-api-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 18080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
