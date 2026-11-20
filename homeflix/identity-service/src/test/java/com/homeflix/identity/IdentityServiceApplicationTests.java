package com.homeflix.identity;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.homeflix.identity.auth.AuthService;
import com.homeflix.identity.setup.SetupService;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class IdentityServiceApplicationTests {

    @MockitoBean SetupService setupService;
    @MockitoBean AuthService authService;
    @MockitoBean com.homeflix.identity.admin.AdminAccountService adminAccountService;

	@Autowired
	MockMvc mockMvc;

	@Test
	void contextLoads() {
	}

	@Test
	void healthIsPublic() throws Exception {
		mockMvc.perform(get("/actuator/health")).andExpect(status().isOk());
	}

	@Test
	void otherEndpointsRequireAuthentication() throws Exception {
		mockMvc.perform(get("/api/v1/anything")).andExpect(status().isUnauthorized());
		mockMvc.perform(get("/actuator/info")).andExpect(status().isUnauthorized());
	}
}
