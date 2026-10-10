package com.ecobrains.lms.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name="portal_users", uniqueConstraints=@UniqueConstraint(name="uk_portal_user_email", columnNames="email"))
public class PortalUser {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @Column(nullable=false,length=150) private String name;
    @Column(nullable=false,unique=true,length=150) private String email;
    @Column(name="password_hash",nullable=false,length=100) private String passwordHash;
    @Column(nullable=false,length=20) private String role="USER";
    @Column(nullable=false) private boolean active=true;
    @Column(name="created_at",nullable=false) private LocalDateTime createdAt;
    @Column(name="updated_at",nullable=false) private LocalDateTime updatedAt;
    public PortalUser() {}
    public Long getId(){return id;} public void setId(Long v){id=v;}
    public String getName(){return name;} public void setName(String v){name=v;}
    public String getEmail(){return email;} public void setEmail(String v){email=v;}
    public String getPasswordHash(){return passwordHash;} public void setPasswordHash(String v){passwordHash=v;}
    public String getRole(){return role;} public void setRole(String v){role=v;}
    public boolean isActive(){return active;} public void setActive(boolean v){active=v;}
    @PrePersist void prePersist(){LocalDateTime n=LocalDateTime.now();createdAt=n;updatedAt=n;}
    @PreUpdate void preUpdate(){updatedAt=LocalDateTime.now();}
    public static Builder builder(){return new Builder();}
    public static class Builder { private final PortalUser x=new PortalUser(); public Builder name(String v){x.name=v;return this;} public Builder email(String v){x.email=v;return this;} public Builder passwordHash(String v){x.passwordHash=v;return this;} public Builder role(String v){x.role=v;return this;} public Builder active(boolean v){x.active=v;return this;} public PortalUser build(){return x;} }
}
