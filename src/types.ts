// REST-AP Protocol Types

export interface RestapCatalog {
  restap_version: string;
  agent: {
    name: string;
    description?: string;
    contact: string;
  };
  packages?: Package[];
  capabilities: Capability[];
}

// Package interface is intentionally flexible. Only name and type are required.
// All other fields should follow the standards of the specified package type
// (Claude plugin format for claude-plugin, npm metadata for npm-package, etc.)
export interface Package {
  name: string;        // Required: Human-readable package name
  type: string;        // Required: Package type (claude-plugin, npm-package, etc.)
  // All other fields are optional and should follow relevant standards
  [key: string]: any;
}

export interface Capability {
  id: string;
  title: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  description?: string;
  input_schema?: any; // JSON Schema for request body
  output_schema?: any; // JSON Schema for response
  content_types?: string[]; // Accepted content types
  parameters?: Parameter[]; // Query/path parameters
  pricing?: {
    free_calls?: number;
    cost_per_call?: number;
    currency?: string;
  };
}

export interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  location: 'query' | 'path' | 'header';
}

export interface TalkRequest {
  message: string;
  session_id?: string;
}

export interface TalkResponse {
  reply: string;
  session_id?: string;
  suggested_actions?: string[];
}

export interface NewsResponse {
  items: NewsItem[];
}

export interface NewsItem {
  type: string;
  job_id?: string;
  message?: string;
  timestamp?: string;
  next_call?: string;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
}