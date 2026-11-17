package com.homeflix.library;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.homeflix.library.media.MediaItemRepository;
import com.homeflix.library.media.MediaMetadataRepository;
import com.homeflix.library.media.MediaRootRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LibraryServiceApplicationTests {

	@Autowired
	MockMvc mockMvc;

	// Profil « test » : pas de base de données, donc pas de repositories JPA. Les dossiers autorisés et
	// leurs règles sont testés avec un vrai PostgreSQL dans MediaRootApiIntegrationTests.
	@MockitoBean MediaRootRepository mediaRootRepository;
	@MockitoBean MediaItemRepository mediaItemRepository;
	@MockitoBean MediaMetadataRepository mediaMetadataRepository;

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
