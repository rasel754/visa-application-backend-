import { Router } from "express";
import { getCategory, listCountries } from "../../config/form-data";
import { AppError, ERROR_MESSAGES } from "../../lib/errors";

export const formsRouter = Router();

formsRouter.get("/countries", (_req, res) => {
  res.json(listCountries());
});

formsRouter.get("/:countryCode/:category", (req, res, next) => {
  const countryCode = String(req.params.countryCode ?? "");
  const category = String(req.params.category ?? "");
  const form = getCategory(countryCode, category);

  if (!form) {
    next(new AppError(404, ERROR_MESSAGES.formNotFound));
    return;
  }

  res.json(form);
});

