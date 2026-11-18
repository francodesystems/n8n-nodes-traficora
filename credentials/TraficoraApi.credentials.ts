import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TraficoraApi implements ICredentialType {
	name = 'traficoraApi';

	displayName = 'Traficora API';

	icon = { light: 'file:traficora.svg', dark: 'file:traficora.dark.svg' } as const;

	// eslint-disable-next-line n8n-nodes-base/cred-class-field-documentation-url-miscased
	documentationUrl = 'https://traficora.com/integraciones/n8n';

	properties: INodeProperties[] = [
		{
			displayName:
				'Traficora runs on Odoo: the node uses the Odoo JSON-2 API of your own Traficora instance, with an API key of a Traficora user. It can do what that user can do, nothing more.',
			name: 'setupNotice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://empresa.traficora.com',
			description:
				'The address you open Traficora with, without /odoo or anything after the domain',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'In Traficora: your avatar (top right) → My Preferences (Mis preferencias) → Account Security (Seguridad de la cuenta) → New API Key. Choose a duration; the key is shown once.',
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'string',
			default: '',
			description:
				'Only needed when the server hosts several databases (sent as the X-Odoo-Database header). Leave it empty for a normal Traficora instance.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=bearer {{$credentials.apiKey}}',
				// Odoo treats an empty header as absent (single database).
				'X-Odoo-Database': '={{$credentials.database || ""}}',
			},
		},
	};

	// res.users/context_get: the cheapest authenticated call (the user's lang and tz).
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.trim().replace(/\\/+$/, "")}}',
			url: '/json/2/res.users/context_get',
			method: 'POST',
			body: {},
			headers: { 'Content-Type': 'application/json' },
		},
	};
}
