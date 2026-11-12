import { Router } from "express";
import { getVisitForm, listCountries } from "../../config/form-data";
import { AppError, ERROR_MESSAGES } from "../../lib/errors";

export const formsRouter = Router();

formsRouter.get("/countries", (_req, res) => {
  res.json(listCountries());
});

formsRouter.get("/:countryCode", (req, res, next) => {
  const countryCode = String(req.params.countryCode ?? "");
  const form = getVisitForm(countryCode);

  if (!form) {
    next(new AppError(404, ERROR_MESSAGES.formNotFound));
    return;
  }

  res.json(form);
});
