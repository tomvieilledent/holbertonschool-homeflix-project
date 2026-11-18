package com.homeflix.identity.security;

import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.ElementType.RECORD_COMPONENT;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import jakarta.validation.ReportAsSingleViolation;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Mot de passe : 12 à 128 caractères (la borne haute évite les abus de hachage). */
@NotBlank
@Size(min = 12, max = 128)
@Documented
@Constraint(validatedBy = {})
@ReportAsSingleViolation
@Target({ FIELD, PARAMETER, RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface StrongPassword {

    String message() default "Le mot de passe doit contenir entre 12 et 128 caractères";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
