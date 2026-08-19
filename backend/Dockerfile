# Build stage
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /app

COPY pom.xml .

RUN mvn dependency:go-offline -B

COPY src ./src

RUN mvn clean package -DskipTests


# Runtime stage
FROM eclipse-temurin:21-jre

WORKDIR /app

ENV TZ=Asia/Kolkata

COPY --from=build /app/target/lms-backend.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-Duser.timezone=Asia/Kolkata", "-jar", "app.jar"]