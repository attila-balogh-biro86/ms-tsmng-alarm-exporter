FROM openjdk:21-jdk-slim

RUN groupadd -r java && useradd --no-log-init -r -g java java
USER java

VOLUME /tmp
COPY *.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java"]
CMD ["-jar", "app.jar"]
