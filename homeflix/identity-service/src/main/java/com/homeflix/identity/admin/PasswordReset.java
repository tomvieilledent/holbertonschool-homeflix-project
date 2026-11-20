package com.homeflix.identity.admin;

import com.homeflix.identity.security.StrongPassword;

public record PasswordReset(@StrongPassword String temporaryPassword) {
}
