package com.ecobrains.lms.service;
import org.springframework.boot.CommandLineRunner;import org.springframework.stereotype.Component;
@Component public class PortalUserBootstrap implements CommandLineRunner{private final PortalUserService service;public PortalUserBootstrap(PortalUserService service){this.service=service;}@Override public void run(String...args){service.ensureAdmin();}}
