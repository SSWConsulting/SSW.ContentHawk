import React from "react";
import { hydrateRoot } from "react-dom/client";
import { FormContent } from "./form-component.tsx";

const props = JSON.parse(document.getElementById("__PROPS__")!.textContent!);
hydrateRoot(document.getElementById("app")!, <FormContent targetRepo={props.targetRepo} token={props.token} />);
