import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import NG from "../public/ng-states-lgas.json";
import { jget, jput } from "../lib/apiBase";
import { notifyError, notifySuccess } from "../components/Toast";

const NAME_PART_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ.'-]{2,60}$/;
const PHONE_PATTERN = /^[0-9+()\s-]{7,20}$/;
const NATIONAL_ID_PATTERN = /^[0-9]{11}$/;
const PVC_PATTERN = /^[A-Z0-9]{8,20}$/;
const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
];

const normalizeList = (source) => {
  if (Array.isArray(source?.states)) return source.states;
  if (!Array.isArray(source)) {
    return Object.entries(source || {}).map(([state, lgas]) => ({ state, lgas }));
  }
  return source;
};

export default function CompleteProfile() {
  const router = useRouter();
  const statesData = useMemo(() => normalizeList(NG), []);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    gender: "",
    dateOfBirth: "",
    nationalId: "",
    voterCardNumber: "",
    residenceAddress: "",
    state: "",
    residenceLGA: "",
    phone: "",
    nationality: "Nigerian",
  });

  const lgasForState = useMemo(() => {
    const entry = statesData.find((item) => item.state === form.state);
    return entry?.lgas || [];
  }, [statesData, form.state]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (typeof window !== "undefined" && !localStorage.getItem("token")) {
          router.replace("/login");
          return;
        }
        const profile = await jget("/api/profile/me");
        if (!active) return;
        setForm((prev) => ({
          ...prev,
          firstName: profile.firstName || "",
          lastName: profile.lastName || "",
          gender: (profile.gender || "").toLowerCase(),
          dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : "",
          nationalId: profile.nationalId || "",
          voterCardNumber: profile.voterCardNumber || "",
          residenceAddress: profile.residenceAddress || "",
          state: profile.state || "",
          residenceLGA: profile.residenceLGA || "",
          phone: profile.phone || "",
          nationality: profile.nationality || "Nigerian",
        }));
        if (profile.needsProfileCompletion === false && typeof window !== "undefined") {
          localStorage.removeItem("needsProfileCompletion");
          router.replace("/");
        }
      } catch (err) {
        notifyError(err.message || "Unable to load your profile");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router, statesData]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    const first = form.firstName.trim().replace(/\s+/g, " ");
    const last = form.lastName.trim().replace(/\s+/g, " ");
    if (!NAME_PART_PATTERN.test(first)) {
      notifyError("First name can only include letters, hyphen, apostrophe, and periods.");
      return false;
    }
    if (!NAME_PART_PATTERN.test(last)) {
      notifyError("Last name can only include letters, hyphen, apostrophe, and periods.");
      return false;
    }
    if (!form.gender) {
      notifyError("Select your gender.");
      return false;
    }
    if (!form.dateOfBirth) {
      notifyError("Select your date of birth.");
      return false;
    }
    const dob = new Date(form.dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      notifyError("Enter a valid date of birth.");
      return false;
    }
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
    if (age < 18) {
      notifyError("You must be at least 18 years old.");
      return false;
    }
    const nin = form.nationalId.replace(/\s+/g, "");
    if (!NATIONAL_ID_PATTERN.test(nin)) {
      notifyError("Enter your 11-digit National Identification Number (NIN).");
      return false;
    }
    const pvc = form.voterCardNumber.trim().toUpperCase().replace(/\s+/g, "");
    if (!PVC_PATTERN.test(pvc)) {
      notifyError("Enter a valid Permanent Voter Card number (letters and numbers only).");
      return false;
    }
    const address = form.residenceAddress.trim();
    if (address.length < 10) {
      notifyError("Residential address must be at least 10 characters.");
      return false;
    }
    if (!form.state) {
      notifyError("Select your state of residence.");
      return false;
    }
    if (!form.residenceLGA) {
      notifyError("Select your local government area.");
      return false;
    }
    const phone = form.phone.trim();
    if (!PHONE_PATTERN.test(phone)) {
      notifyError("Enter a valid phone number.");
      return false;
    }
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await jput("/api/profile/complete", {
        firstName: form.firstName.trim().replace(/\s+/g, " "),
        lastName: form.lastName.trim().replace(/\s+/g, " "),
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        nationalId: form.nationalId.replace(/\s+/g, ""),
        voterCardNumber: form.voterCardNumber.trim().toUpperCase().replace(/\s+/g, ""),
        residenceAddress: form.residenceAddress.trim(),
        state: form.state,
        residenceLGA: form.residenceLGA,
        phone: form.phone.trim(),
        nationality: form.nationality.trim() || "Nigerian",
      });
      notifySuccess("Profile saved.");
      if (typeof window !== "undefined") {
        localStorage.removeItem("needsProfileCompletion");
        const trimmedFirst = form.firstName.trim();
        const trimmedLast = form.lastName.trim();
        const combinedFullName = `${trimmedFirst} ${trimmedLast}`.trim();
        if (trimmedFirst) localStorage.setItem("firstName", trimmedFirst);
        if (trimmedLast) localStorage.setItem("lastName", trimmedLast);
        if (combinedFullName) localStorage.setItem("fullName", combinedFullName);
      }
      router.replace("/");
    } catch (err) {
      notifyError(err.message || "Could not complete profile");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-4xl items-center justify-center">
        <p className="text-sm text-slate-500">Loading your profile…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-12">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">
            Profile completion required
          </span>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Provide your civic details</h1>
          <p className="mt-3 text-sm text-slate-600 sm:text-base">
            These details help the commission confirm your identity and eligibility across national, state, and local programmes.
          </p>
        </div>

        <div className="card">
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="firstName">First name</label>
                <input
                  id="firstName"
                  className="form-control"
                  value={form.firstName}
                  onChange={(e) => handleChange("firstName", e.target.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ.' -]/g, ""))}
                  placeholder="Jane"
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="lastName">Last name</label>
                <input
                  id="lastName"
                  className="form-control"
                  value={form.lastName}
                  onChange={(e) => handleChange("lastName", e.target.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ.' -]/g, ""))}
                  placeholder="Doe"
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="gender">Gender</label>
                <select
                  id="gender"
                  className="form-control"
                  value={form.gender}
                  onChange={(e) => handleChange("gender", e.target.value)}
                >
                  <option value="">Select gender…</option>
                  {GENDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="dob">Date of birth</label>
                <input
                  id="dob"
                  type="date"
                  className="form-control"
                  value={form.dateOfBirth}
                  onChange={(e) => handleChange("dateOfBirth", e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="nin">National Identification Number (NIN)</label>
                <input
                  id="nin"
                  inputMode="numeric"
                  maxLength={11}
                  className="form-control"
                  value={form.nationalId}
                  onChange={(e) => handleChange("nationalId", e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="11 digits"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="pvc">Permanent Voter Card (PVC)</label>
                <input
                  id="pvc"
                  className="form-control uppercase"
                  value={form.voterCardNumber}
                  onChange={(e) => handleChange("voterCardNumber", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  placeholder="Letters and numbers only"
                />
              </div>
            </div>

            <div>
              <label className="form-label" htmlFor="address">Residential address</label>
              <textarea
                id="address"
                className="form-control"
                rows={2}
                value={form.residenceAddress}
                onChange={(e) => handleChange("residenceAddress", e.target.value.replace(/[^A-Za-z0-9\s,.'/-]/g, ""))}
                placeholder="House number, street, town"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="state">State of residence</label>
                <select
                  id="state"
                  className="form-control"
                  value={form.state}
                  onChange={(e) => handleChange("state", e.target.value)}
                >
                  <option value="">Select state…</option>
                  {statesData.map((entry) => (
                    <option key={entry.state} value={entry.state}>{entry.state}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="lga">LGA of residence</label>
                <select
                  id="lga"
                  className="form-control"
                  value={form.residenceLGA}
                  onChange={(e) => handleChange("residenceLGA", e.target.value)}
                  disabled={!form.state}
                >
                  <option value="">{form.state ? "Select LGA…" : "Pick state first"}</option>
                  {lgasForState.map((lga) => (
                    <option key={lga} value={lga}>{lga}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="phone">Phone number</label>
                <input
                  id="phone"
                  className="form-control"
                  value={form.phone}
                  onChange={(e) => handleChange("phone", e.target.value.replace(/[^0-9+()\s-]/g, ""))}
                  placeholder="+234 800 000 0000"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="nationality">Nationality</label>
                <input
                  id="nationality"
                  className="form-control"
                  value={form.nationality}
                  onChange={(e) => handleChange("nationality", e.target.value)}
                  placeholder="Nationality"
                />
              </div>
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? "Saving…" : "Save profile"}
            </button>
            <p className="text-center text-xs text-slate-500">
              Need help? <Link href="/faq" className="text-indigo-600 underline">Visit the support centre</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
