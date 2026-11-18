package com.homeflix.acquisition;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.homeflix.acquisition.catalogue.CatalogueEntryRepository;
import com.homeflix.acquisition.download.DownloadRepository;
import com.homeflix.acquisition.rights.RightsAcknowledgementRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AcquisitionServiceApplicationTests {

	// Profil « test » : pas de base de données, donc pas de repositories JPA. Le catalogue et le schéma sont testés
	// avec un vrai PostgreSQL dans CatalogueApiIntegrationTests et CataloguePersistenceIntegrationTests.
	@MockitoBean CatalogueEntryRepository catalogueEntryRepository;
	@MockitoBean DownloadRepository downloadRepository;
	@MockitoBean RightsAcknowledgementRepository rightsAcknowledgementRepository;

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
