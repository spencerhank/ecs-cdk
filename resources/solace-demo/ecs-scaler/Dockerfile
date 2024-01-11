## Dockerfile for Solace ECS Service Scaler
## --> Requires config file mounted as volume to /opt/ecs-scaler/config.yaml

FROM openjdk:17.0.2-jdk

RUN mkdir -p /opt/ecs-scaler
RUN chmod 777 /opt/ecs-scaler
WORKDIR /opt/ecs-scaler

ADD solace-ecs-scaler-*-jar-with-dependencies.jar ./solace-ecs-scaler.jar
ADD scaler-config.yaml ./config.yaml

ENTRYPOINT ["java", "-jar", "/opt/ecs-scaler/solace-ecs-scaler.jar", "--config-file=/opt/ecs-scaler/config.yaml"]
