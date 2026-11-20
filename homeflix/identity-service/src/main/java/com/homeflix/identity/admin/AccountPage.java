package com.homeflix.identity.admin;

import java.util.List;

import com.homeflix.identity.setup.AccountResponse;

public record AccountPage(List<AccountResponse> items, int page, int size, long total, int totalPages) {
}
