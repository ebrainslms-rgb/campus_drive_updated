package com.ecobrains.lms.service;
import com.ecobrains.lms.dto.request.RegistrationSettingsRequest;
import com.ecobrains.lms.entity.RegistrationSettings;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.RegistrationSettingsRepository;
import org.springframework.stereotype.Service;

@Service
public class RegistrationSettingsService {
 private final RegistrationSettingsRepository repo;
 public RegistrationSettingsService(RegistrationSettingsRepository repo){this.repo=repo;}
 public RegistrationSettings get(){ return repo.findById(1L).orElseGet(()->repo.save(RegistrationSettings.builder().id(1L).build())); }
 public RegistrationSettings update(RegistrationSettingsRequest r){
  String t=r.academicScoreType()==null?"BOTH":r.academicScoreType().trim().toUpperCase();
  if(!t.equals("PERCENTAGE")&&!t.equals("CGPA")&&!t.equals("BOTH")&&!t.equals("HIDDEN")) throw ApiException.badRequest("Academic score type must be PERCENTAGE, CGPA, BOTH or HIDDEN.");
  RegistrationSettings s=get(); s.setGenderEnabled(r.genderEnabled()); s.setDobEnabled(r.dobEnabled()); s.setQualificationEnabled(r.qualificationEnabled()); s.setYearEnabled(r.yearEnabled()); s.setAcademicScoreEnabled(r.academicScoreEnabled() && !t.equals("HIDDEN")); s.setAcademicScoreType(t); s.setOtherCampusDriveEnabled(r.otherCampusDriveEnabled()); return repo.save(s);
 }
 public void validate(String gender,String dob,Double score,String scoreType,Integer year,String qualification,String selected){
  RegistrationSettings s=get();
  if(s.isGenderEnabled() && (gender==null||gender.isBlank())) throw ApiException.badRequest("Gender is required.");
  if(s.isDobEnabled() && (dob==null||dob.isBlank())) throw ApiException.badRequest("Date of birth is required.");
  if(s.isDobEnabled() && dob!=null && !dob.isBlank()){ try { java.time.LocalDate d=java.time.LocalDate.parse(dob); if(d.isAfter(java.time.LocalDate.now().minusYears(18))) throw ApiException.badRequest("Student must be at least 18 years old."); } catch(java.time.format.DateTimeParseException e){ throw ApiException.badRequest("Invalid date of birth."); } }
  if(s.isQualificationEnabled() && (qualification==null||qualification.isBlank())) throw ApiException.badRequest("Highest qualification is required.");
  if(s.isYearEnabled() && year==null) throw ApiException.badRequest("Year of passing is required.");
  if(s.isOtherCampusDriveEnabled() && (selected==null||selected.isBlank())) throw ApiException.badRequest("Please select Yes or No for other campus drive.");
  if(s.isOtherCampusDriveEnabled() && selected!=null && !selected.isBlank() && !selected.equalsIgnoreCase("YES") && !selected.equalsIgnoreCase("NO")) throw ApiException.badRequest("Selected in Any Other Campus Drive must be Yes or No.");
  if(s.isAcademicScoreEnabled()){
   if(score==null) throw ApiException.badRequest("Academic score is required.");
   String type=scoreType==null?"":scoreType.trim().toUpperCase();
   if(s.getAcademicScoreType().equals("PERCENTAGE") && !type.equals("PERCENTAGE")) throw ApiException.badRequest("Academic score must be Percentage.");
   if(s.getAcademicScoreType().equals("CGPA") && !type.equals("CGPA")) throw ApiException.badRequest("Academic score must be CGPA.");
   if(s.getAcademicScoreType().equals("BOTH") && !type.equals("CGPA")&&!type.equals("PERCENTAGE")) throw ApiException.badRequest("Academic score type must be CGPA or PERCENTAGE.");
   double max=type.equals("CGPA")?10:100; if(score<0||score>max) throw ApiException.badRequest(type.equals("CGPA")?"CGPA must be between 0 and 10.":"Percentage must be between 0 and 100.");
  }
 }
}
