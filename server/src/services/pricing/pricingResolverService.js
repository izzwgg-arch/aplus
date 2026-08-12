import { prisma } from "../../config/prisma.js";

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export async function resolveAppointmentPricing({
  serviceId,
  providerId,
  durationMinutes = 60,
  isOvertime = false,
  removeOvertimeCharge = false
}) {
  // Provider is optional — only look it up if a providerId was supplied
  const hasProvider = Boolean(providerId);

  const [service, provider, serviceProvider] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId } }),
    hasProvider ? prisma.provider.findUnique({ where: { id: providerId } }) : Promise.resolve(null),
    hasProvider
      ? prisma.serviceProvider.findUnique({ where: { serviceId_providerId: { serviceId, providerId } } })
      : Promise.resolve(null)
  ]);

  if (!service) {
    const error = new Error("Service not found");
    error.status = 404;
    throw error;
  }
  // Only validate provider existence if one was explicitly provided
  if (hasProvider && !provider) {
    const error = new Error("Provider not found");
    error.status = 404;
    throw error;
  }
  if (!service.isActive) {
    const error = new Error("Service is inactive");
    error.status = 400;
    throw error;
  }
  if (provider && !provider.isActive) {
    const error = new Error("Provider is inactive");
    error.status = 400;
    throw error;
  }
  if (serviceProvider && !serviceProvider.isEnabled) {
    const error = new Error("Provider is not enabled for this service");
    error.status = 400;
    throw error;
  }

  const standardRate = serviceProvider?.customRate ?? service.standardRate ?? provider?.defaultHourlyRate ?? 0;
  const overtimeRate = serviceProvider?.customOvertimeRate
    ?? service.overtimeRate
    ?? provider?.overtimeHourlyRate
    ?? standardRate;

  let effectiveRate = standardRate;
  let pricingSource = serviceProvider?.customRate ? "SERVICE_PROVIDER_CUSTOM_STANDARD" : "SERVICE_STANDARD";

  if (isOvertime) {
    if (removeOvertimeCharge) {
      effectiveRate = standardRate;
      pricingSource = "SERVICE_OVERTIME_REMOVED";
    } else {
      effectiveRate = overtimeRate;
      pricingSource = serviceProvider?.customOvertimeRate ? "SERVICE_PROVIDER_CUSTOM_OVERTIME" : "SERVICE_OVERTIME";
    }
  }

  const hours = Number(durationMinutes || 60) / 60;
  const estimatedCharge = round2(effectiveRate * hours);

  return {
    service,
    provider,
    serviceProvider,
    standardRateSnapshot: round2(standardRate),
    overtimeRateSnapshot: round2(overtimeRate),
    effectiveRate: round2(effectiveRate),
    pricingSource,
    estimatedCharge,
    durationMinutes: Number(durationMinutes || 60)
  };
}
