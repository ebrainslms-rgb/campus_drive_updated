package com.ecobrains.lms.dto.request;
import jakarta.validation.constraints.*;
import java.util.Map;
public record PortalUserRequest(@NotBlank String name,@NotBlank @Email String email,String password,Map<String,PermissionValue> permissions,Boolean active) { public record PermissionValue(Boolean read, Boolean modify) {} }
