GRANT EXECUTE ON FUNCTION public.security_selfcheck() TO postgres;
GRANT EXECUTE ON FUNCTION public.security_report_findings(text, text, jsonb) TO postgres;