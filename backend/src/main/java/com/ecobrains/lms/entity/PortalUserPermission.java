package com.ecobrains.lms.entity;

import jakarta.persistence.*;

@Entity
@Table(name="portal_user_permissions", uniqueConstraints=@UniqueConstraint(name="uk_portal_permission", columnNames={"user_id","permission_key"}))
public class PortalUserPermission {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="user_id",nullable=false) private PortalUser user;
    @Column(name="permission_key",nullable=false,length=60) private String permissionKey;
    @Column(name="read_access",nullable=false) private boolean readAccess=false;
    @Column(name="modify_access",nullable=false) private boolean modifyAccess=false;
    public PortalUserPermission() {}
    public Long getId(){return id;} public void setId(Long v){id=v;}
    public PortalUser getUser(){return user;} public void setUser(PortalUser v){user=v;}
    public String getPermissionKey(){return permissionKey;} public void setPermissionKey(String v){permissionKey=v;}
    public boolean isReadAccess(){return readAccess;} public void setReadAccess(boolean v){readAccess=v;}
    public boolean isModifyAccess(){return modifyAccess;} public void setModifyAccess(boolean v){modifyAccess=v;}
    public static Builder builder(){return new Builder();}
    public static class Builder { private final PortalUserPermission x=new PortalUserPermission(); public Builder user(PortalUser v){x.user=v;return this;} public Builder permissionKey(String v){x.permissionKey=v;return this;} public Builder readAccess(boolean v){x.readAccess=v;return this;} public Builder modifyAccess(boolean v){x.modifyAccess=v;return this;} public PortalUserPermission build(){return x;} }
}
