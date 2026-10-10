package com.ecobrains.lms.entity;

import jakarta.persistence.*;

@Entity
@Table(name="registration_settings")
public class RegistrationSettings {
    @Id private Long id;
    @Column(nullable=false) private boolean genderEnabled=true;
    @Column(nullable=false) private boolean dobEnabled=true;
    @Column(nullable=false) private boolean qualificationEnabled=true;
    @Column(nullable=false) private boolean yearEnabled=true;
    @Column(nullable=false) private boolean academicScoreEnabled=true;
    @Column(nullable=false,length=20) private String academicScoreType="BOTH";
    @Column(nullable=false) private boolean otherCampusDriveEnabled=true;
    public RegistrationSettings() {}
    public Long getId(){return id;} public void setId(Long v){id=v;}
    public boolean isGenderEnabled(){return genderEnabled;} public void setGenderEnabled(boolean v){genderEnabled=v;}
    public boolean isDobEnabled(){return dobEnabled;} public void setDobEnabled(boolean v){dobEnabled=v;}
    public boolean isQualificationEnabled(){return qualificationEnabled;} public void setQualificationEnabled(boolean v){qualificationEnabled=v;}
    public boolean isYearEnabled(){return yearEnabled;} public void setYearEnabled(boolean v){yearEnabled=v;}
    public boolean isAcademicScoreEnabled(){return academicScoreEnabled;} public void setAcademicScoreEnabled(boolean v){academicScoreEnabled=v;}
    public String getAcademicScoreType(){return academicScoreType;} public void setAcademicScoreType(String v){academicScoreType=v;}
    public boolean isOtherCampusDriveEnabled(){return otherCampusDriveEnabled;} public void setOtherCampusDriveEnabled(boolean v){otherCampusDriveEnabled=v;}
    public static Builder builder(){return new Builder();}
    public static class Builder { private final RegistrationSettings x=new RegistrationSettings(); public Builder id(Long v){x.id=v;return this;} public Builder genderEnabled(boolean v){x.genderEnabled=v;return this;} public Builder dobEnabled(boolean v){x.dobEnabled=v;return this;} public Builder qualificationEnabled(boolean v){x.qualificationEnabled=v;return this;} public Builder yearEnabled(boolean v){x.yearEnabled=v;return this;} public Builder academicScoreEnabled(boolean v){x.academicScoreEnabled=v;return this;} public Builder academicScoreType(String v){x.academicScoreType=v;return this;} public Builder otherCampusDriveEnabled(boolean v){x.otherCampusDriveEnabled=v;return this;} public RegistrationSettings build(){return x;} }
}
