import { useId, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import provinces from "../../../shared/vietnam-addresses.json";
import { fold } from "@/lib/api";
import { Field, FieldLabel } from "./ui/field";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";

type Place = { code: string; name: string };
export type Address = { province_code: string; ward_code: string };
function PlacePicker({
  label,
  name,
  value,
  places,
  onChange,
  disabled,
  required,
}: {
  label: string;
  name: string;
  value: string;
  places: Place[];
  onChange: (value: string) => void;
  disabled?: boolean;
  required: boolean;
}) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [invalid, setInvalid] = useState(false);
  const selected = places.find((p) => p.code === value);
  return (
    <Field data-invalid={invalid && !value}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={trigger}
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-required={required}
            aria-invalid={invalid && !value}
            aria-controls={`${id}-list`}
            disabled={disabled}
            className="address-trigger"
          >
            <span className="truncate">
              {selected?.name ||
                (name === "province_code"
                  ? "Chọn tỉnh / thành phố"
                  : "Chọn phường / xã")}
            </span>
            <ChevronsUpDown data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="address-popover"
          align="start"
          aria-label={`Chọn ${label.toLowerCase()}`}
        >
          <Command
            filter={(value, search) =>
              fold(value).includes(fold(search).trim()) ? 1 : 0
            }
          >
            <CommandInput
              aria-label={`Tìm ${label.toLowerCase()}`}
              placeholder="Nhập tên để tìm…"
            />
            <CommandList id={`${id}-list`} aria-label={label}>
              <CommandEmpty>Không tìm thấy địa chỉ.</CommandEmpty>
              <CommandGroup>
                {places.map((place) => (
                  <CommandItem
                    key={place.code}
                    value={place.name}
                    onSelect={() => {
                      onChange(place.code);
                      setInvalid(false);
                      setOpen(false);
                    }}
                  >
                    {place.name}
                    {value === place.code && (
                      <Check className="ml-auto" aria-hidden="true" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {/* A native validation proxy participates in the enclosing form, including disabled steps. */}
      <input
        className="address-validation"
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        value={value || ""}
        onChange={() => {}}
        required={required}
        disabled={disabled}
        onInvalid={(e) => {
          e.preventDefault();
          setInvalid(true);
          trigger.current?.focus();
        }}
      />
    </Field>
  );
}
const sortedProvinces = [...provinces].sort((a, b) =>
  a.name
    .replace(/^(Tỉnh|Thành phố) /, "")
    .localeCompare(b.name.replace(/^(Tỉnh|Thành phố) /, ""), "vi"),
);
export function AddressFields({
  value,
  onChange,
  required = true,
}: {
  value: Address;
  onChange: (address: Address, label: string) => void;
  required?: boolean;
}) {
  const province = provinces.find((p) => p.code === value.province_code);
  const wards = [...(province?.wards || [])].sort((a, b) =>
    a.name.localeCompare(b.name, "vi"),
  );
  return (
    <div className="form-two address-fields">
      <PlacePicker
        label="Tỉnh / Thành phố"
        name="province_code"
        value={value.province_code}
        places={sortedProvinces}
        required={required}
        onChange={(code) => {
          if (code !== value.province_code)
            onChange({ province_code: code, ward_code: "" }, "");
        }}
      />
      <PlacePicker
        key={province?.code || "ward"}
        label="Phường / Xã / Đặc khu"
        name="ward_code"
        value={value.ward_code}
        places={wards}
        required={required}
        disabled={!province}
        onChange={(code) => {
          const ward = province!.wards.find((w) => w.code === code)!;
          onChange(
            { province_code: province!.code, ward_code: code },
            `${ward.name}, ${province!.name}`,
          );
        }}
      />
    </div>
  );
}
