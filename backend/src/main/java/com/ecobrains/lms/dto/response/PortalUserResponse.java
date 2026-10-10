package com.ecobrains.lms.dto.response;
import java.util.Map;
public record PortalUserResponse(Long id,String name,String email,String role,boolean active,Map<String,PermissionValue> permissions){ public record PermissionValue(boolean read,boolean modify){} }
